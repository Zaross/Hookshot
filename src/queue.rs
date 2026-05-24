use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn enqueue(
    pool: &SqlitePool,
    repository_id: Option<&str>,
    discord_url: &str,
    embed_json: &str,
    delay_seconds: i64,
) {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let next_retry = (now + chrono::Duration::seconds(delay_seconds)).to_rfc3339();
    let _ = sqlx::query(
        "INSERT INTO webhook_queue (id, repository_id, discord_url, embed_json, attempts, max_attempts, next_retry_at, created_at, status) VALUES (?, ?, ?, ?, 0, 5, ?, ?, 'pending')",
    )
    .bind(&id)
    .bind(repository_id)
    .bind(discord_url)
    .bind(embed_json)
    .bind(&next_retry)
    .bind(now.to_rfc3339())
    .execute(pool)
    .await;
}

pub async fn run_processor(pool: SqlitePool) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap();

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(15)).await;

        let now = Utc::now().to_rfc3339();

        let rows = match sqlx::query(
            "SELECT id, repository_id, discord_url, embed_json, attempts FROM webhook_queue WHERE status = 'pending' AND next_retry_at <= ? LIMIT 10",
        )
        .bind(&now)
        .fetch_all(&pool)
        .await
        {
            Ok(r) => r,
            Err(e) => { tracing::error!("Queue fetch error: {}", e); continue; }
        };

        for row in rows {
            use sqlx::Row;
            let id: String = row.get("id");
            let discord_url: String = row.get("discord_url");
            let embed_json: String = row.get("embed_json");
            let attempts: i64 = row.get("attempts");

            let payload: serde_json::Value = match serde_json::from_str(&embed_json) {
                Ok(v) => v,
                Err(_) => {
                    let _ = sqlx::query("UPDATE webhook_queue SET status = 'failed' WHERE id = ?")
                        .bind(&id)
                        .execute(&pool)
                        .await;
                    continue;
                }
            };

            let result = client.post(&discord_url).json(&payload).send().await;

            match result {
                Ok(resp) if resp.status().is_success() => {
                    let _ = sqlx::query("DELETE FROM webhook_queue WHERE id = ?")
                        .bind(&id)
                        .execute(&pool)
                        .await;
                    tracing::info!("Queue: sent queued webhook {}", id);
                }
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    let new_attempts = attempts + 1;
                    let delay = exponential_backoff(new_attempts);
                    let next = (Utc::now() + chrono::Duration::seconds(delay)).to_rfc3339();

                    if new_attempts >= 5 {
                        let _ = sqlx::query(
                            "UPDATE webhook_queue SET status = 'failed', attempts = ? WHERE id = ?",
                        )
                        .bind(new_attempts)
                        .bind(&id)
                        .execute(&pool)
                        .await;
                        tracing::warn!("Queue: item {} permanently failed (HTTP {})", id, status);
                    } else {
                        let _ = sqlx::query(
                            "UPDATE webhook_queue SET attempts = ?, next_retry_at = ? WHERE id = ?",
                        )
                        .bind(new_attempts)
                        .bind(&next)
                        .bind(&id)
                        .execute(&pool)
                        .await;
                    }
                }
                Err(e) => {
                    let new_attempts = attempts + 1;
                    let delay = exponential_backoff(new_attempts);
                    let next = (Utc::now() + chrono::Duration::seconds(delay)).to_rfc3339();
                    if new_attempts >= 5 {
                        let _ = sqlx::query(
                            "UPDATE webhook_queue SET status = 'failed', attempts = ? WHERE id = ?",
                        )
                        .bind(new_attempts)
                        .bind(&id)
                        .execute(&pool)
                        .await;
                    } else {
                        let _ = sqlx::query(
                            "UPDATE webhook_queue SET attempts = ?, next_retry_at = ? WHERE id = ?",
                        )
                        .bind(new_attempts)
                        .bind(&next)
                        .bind(&id)
                        .execute(&pool)
                        .await;
                    }
                    tracing::warn!("Queue: item {} error: {}", id, e);
                }
            }

            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }
}

fn exponential_backoff(attempt: i64) -> i64 {
    match attempt {
        1 => 30,
        2 => 60,
        3 => 120,
        _ => 300,
    }
}
