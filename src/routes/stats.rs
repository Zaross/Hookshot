use std::collections::HashMap;
use std::sync::Arc;

use axum::{extract::State, Json};
use chrono::Utc;
use sqlx::Row;

use crate::{error::Result, state::AppState};

#[utoipa::path(
    get,
    path = "/api/stats",
    tag = "stats",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "Webhook delivery statistics"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn get(State(state): State<Arc<AppState>>) -> Result<Json<serde_json::Value>> {
    let now = Utc::now();
    let cutoff_24h = (now - chrono::Duration::hours(24)).to_rfc3339();
    let cutoff_7d = (now - chrono::Duration::days(7)).to_rfc3339();

    let success_24h: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM webhook_logs WHERE status = 'success' AND created_at > ?",
    )
    .bind(&cutoff_24h)
    .fetch_one(&state.pool)
    .await?;

    let failed_24h: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM webhook_logs WHERE status = 'failed' AND created_at > ?",
    )
    .bind(&cutoff_24h)
    .fetch_one(&state.pool)
    .await?;

    let skipped_24h: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM webhook_logs WHERE status = 'skipped' AND created_at > ?",
    )
    .bind(&cutoff_24h)
    .fetch_one(&state.pool)
    .await?;

    let total_all: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM webhook_logs")
        .fetch_one(&state.pool)
        .await?;
    let success_all: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM webhook_logs WHERE status = 'success'")
            .fetch_one(&state.pool)
            .await?;

    let by_day_rows = sqlx::query(
        "SELECT substr(created_at, 1, 10) as day, status, COUNT(*) as count \
         FROM webhook_logs WHERE created_at > ? \
         GROUP BY day, status ORDER BY day ASC",
    )
    .bind(&cutoff_7d)
    .fetch_all(&state.pool)
    .await?;

    let mut day_map: HashMap<String, serde_json::Value> = HashMap::new();
    for row in &by_day_rows {
        let day: String = row.get("day");
        let status: String = row.get("status");
        let count: i64 = row.get("count");
        let entry = day_map.entry(day.clone()).or_insert_with(
            || serde_json::json!({ "date": day, "success": 0, "failed": 0, "skipped": 0 }),
        );
        entry[&status] = serde_json::json!(count);
    }
    let mut by_day: Vec<serde_json::Value> = day_map.into_values().collect();
    by_day.sort_by(|a, b| a["date"].as_str().cmp(&b["date"].as_str()));

    let by_repo_rows = sqlx::query(
        "SELECT r.full_name, r.id, \
         SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END) as success_count, \
         SUM(CASE WHEN l.status = 'failed' THEN 1 ELSE 0 END) as failed_count, \
         COUNT(*) as total \
         FROM webhook_logs l \
         LEFT JOIN repositories r ON l.repository_id = r.id \
         WHERE l.created_at > ? AND l.repository_id IS NOT NULL \
         GROUP BY l.repository_id ORDER BY total DESC LIMIT 5",
    )
    .bind(&cutoff_7d)
    .fetch_all(&state.pool)
    .await?;

    let by_repo: Vec<serde_json::Value> = by_repo_rows.iter().map(|row| {
        let name: String = row.try_get("full_name").unwrap_or_else(|_| "Unbekannt".to_string());
        let success: i64 = row.get("success_count");
        let failed: i64 = row.get("failed_count");
        let total: i64 = row.get("total");
        serde_json::json!({ "name": name, "success": success, "failed": failed, "total": total })
    }).collect();

    let success_rate = if total_all > 0 {
        (success_all as f64 / total_all as f64 * 100.0).round() as i64
    } else {
        0
    };

    Ok(Json(serde_json::json!({
        "success_24h": success_24h,
        "failed_24h": failed_24h,
        "skipped_24h": skipped_24h,
        "total_24h": success_24h + failed_24h + skipped_24h,
        "total_all": total_all,
        "success_rate": success_rate,
        "by_day": by_day,
        "by_repo": by_repo,
    })))
}
