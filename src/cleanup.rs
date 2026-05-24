use sqlx::SqlitePool;

pub async fn run_log_cleanup(pool: SqlitePool) {
    purge_old_logs(&pool).await;
    purge_old_audit_logs(&pool).await;
    purge_expired_blacklist(&pool).await;
    purge_old_rate_limits(&pool).await;

    let mut day_counter: u32 = 0;

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(24 * 3_600)).await;
        purge_old_logs(&pool).await;
        purge_old_audit_logs(&pool).await;
        purge_expired_blacklist(&pool).await;
        purge_old_rate_limits(&pool).await;
        day_counter += 1;
        if day_counter >= 7 {
            run_database_maintenance(&pool).await;
            day_counter = 0;
        }
    }
}

async fn run_database_maintenance(pool: &SqlitePool) {
    if let Err(e) = sqlx::query("PRAGMA optimize").execute(pool).await {
        tracing::error!("PRAGMA optimize failed: {e}");
    }
    if let Err(e) = sqlx::query("ANALYZE").execute(pool).await {
        tracing::error!("ANALYZE failed: {e}");
    }
    if let Err(e) = sqlx::query("VACUUM").execute(pool).await {
        tracing::error!("VACUUM failed: {e}");
    }
    tracing::info!("Database maintenance complete (VACUUM + ANALYZE)");
}

async fn purge_expired_blacklist(pool: &SqlitePool) {
    match sqlx::query("DELETE FROM token_blacklist WHERE expires_at < datetime('now')")
        .execute(pool)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::debug!(
                "Blacklist cleanup: removed {} expired entr{}",
                r.rows_affected(),
                if r.rows_affected() == 1 { "y" } else { "ies" }
            );
        }
        Ok(_) => {}
        Err(e) => tracing::error!("Blacklist cleanup failed: {e}"),
    }
}

async fn purge_old_logs(pool: &SqlitePool) {
    let days: i64 = sqlx::query_scalar(
        "SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'log_retention_days'",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or(90);

    if days <= 0 {
        return;
    }

    match sqlx::query("DELETE FROM webhook_logs WHERE created_at < datetime('now', ?)")
        .bind(format!("-{days} days"))
        .execute(pool)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::info!(
                "Log cleanup: removed {} entr{} older than {} days",
                r.rows_affected(),
                if r.rows_affected() == 1 { "y" } else { "ies" },
                days
            );
        }
        Ok(_) => {}
        Err(e) => tracing::error!("Log cleanup failed: {e}"),
    }
}

async fn purge_old_audit_logs(pool: &SqlitePool) {
    let days: i64 = sqlx::query_scalar(
        "SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'audit_log_retention_days'",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or(30);

    if days <= 0 {
        return;
    }

    match sqlx::query("DELETE FROM audit_logs WHERE created_at < datetime('now', ?)")
        .bind(format!("-{days} days"))
        .execute(pool)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::info!(
                "Audit log cleanup: removed {} entr{} older than {} days",
                r.rows_affected(),
                if r.rows_affected() == 1 { "y" } else { "ies" },
                days
            );
        }
        Ok(_) => {}
        Err(e) => tracing::error!("Audit log cleanup failed: {e}"),
    }
}

async fn purge_old_rate_limits(pool: &SqlitePool) {
    let _ = sqlx::query("DELETE FROM rate_limit WHERE window_start < datetime('now', '-1 hour')")
        .execute(pool)
        .await;
}
