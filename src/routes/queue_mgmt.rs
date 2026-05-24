use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use sqlx::Row;

use crate::{
    error::{AppError, Result},
    state::AppState,
};

#[utoipa::path(
    get,
    path = "/api/queue",
    tag = "queue",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "Queue items with pending/failed counts"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn list(State(state): State<Arc<AppState>>) -> Result<Json<serde_json::Value>> {
    let rows = sqlx::query(
        "SELECT id, repository_id, discord_url, embed_json, attempts, max_attempts, next_retry_at, created_at, status FROM webhook_queue ORDER BY created_at DESC LIMIT 200",
    )
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<String, _>("id"),
                "repository_id": row.get::<Option<String>, _>("repository_id"),
                "discord_url": row.get::<String, _>("discord_url"),
                "attempts": row.get::<i64, _>("attempts"),
                "max_attempts": row.get::<i64, _>("max_attempts"),
                "next_retry_at": row.get::<String, _>("next_retry_at"),
                "created_at": row.get::<String, _>("created_at"),
                "status": row.get::<String, _>("status"),
            })
        })
        .collect();

    let pending: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM webhook_queue WHERE status = 'pending'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let failed: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM webhook_queue WHERE status = 'failed'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);

    Ok(Json(
        serde_json::json!({ "items": items, "pending": pending, "failed": failed }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/queue/{id}/retry",
    tag = "queue",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "Queue item ID")),
    responses(
        (status = 200, description = "Retry succeeded"),
        (status = 404, description = "Not found"),
    )
)]
pub async fn retry(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let row = sqlx::query("SELECT discord_url, embed_json FROM webhook_queue WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let discord_url: String = row.get("discord_url");
    let embed_json: String = row.get("embed_json");

    let payload: serde_json::Value = serde_json::from_str(&embed_json)
        .map_err(|_| AppError::Internal("Invalid embed JSON".to_string()))?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let resp = client
        .post(&discord_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    if resp.status().is_success() {
        sqlx::query("DELETE FROM webhook_queue WHERE id = ?")
            .bind(&id)
            .execute(&state.pool)
            .await?;
        Ok(Json(serde_json::json!({ "success": true })))
    } else {
        let status = resp.status().as_u16();
        let now = Utc::now().to_rfc3339();
        let next = (Utc::now() + chrono::Duration::seconds(60)).to_rfc3339();
        sqlx::query("UPDATE webhook_queue SET status = 'pending', next_retry_at = ?, updated_at = ? WHERE id = ?")
            .bind(&next).bind(&now).bind(&id)
            .execute(&state.pool).await?;
        Err(AppError::Internal(format!("Discord returned {status}")))
    }
}

#[utoipa::path(
    delete,
    path = "/api/queue/{id}",
    tag = "queue",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "Queue item ID")),
    responses(
        (status = 200, description = "Deleted"),
        (status = 404, description = "Not found"),
    )
)]
pub async fn delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM webhook_queue WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "success": true })))
}

#[utoipa::path(
    post,
    path = "/api/queue/purge-failed",
    tag = "queue",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "Number of purged failed items"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn purge_failed(State(state): State<Arc<AppState>>) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM webhook_queue WHERE status = 'failed'")
        .execute(&state.pool)
        .await?;
    Ok(Json(
        serde_json::json!({ "deleted": result.rows_affected() }),
    ))
}
