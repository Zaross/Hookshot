use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn log(
    pool: &SqlitePool,
    user_id: Option<&str>,
    username: &str,
    action: &str,
    target_type: Option<&str>,
    target_id: Option<&str>,
    details: Option<&str>,
) {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let _ = sqlx::query(
        "INSERT INTO audit_logs (id, user_id, username, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(username)
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(details)
    .bind(&now)
    .execute(pool)
    .await;
}
