use std::sync::Arc;

use axum::{extract::State, Json};
use sqlx::Row;

use crate::{error::Result, state::AppState};

#[utoipa::path(
    get,
    path = "/api/audit",
    tag = "audit",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "Audit log entries (last 500)"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn list(State(state): State<Arc<AppState>>) -> Result<Json<serde_json::Value>> {
    let rows = sqlx::query(
        "SELECT id, user_id, username, action, target_type, target_id, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 500",
    )
    .fetch_all(&state.pool)
    .await?;

    let logs: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<String, _>("id"),
                "user_id": row.get::<Option<String>, _>("user_id"),
                "username": row.get::<String, _>("username"),
                "action": row.get::<String, _>("action"),
                "target_type": row.get::<Option<String>, _>("target_type"),
                "target_id": row.get::<Option<String>, _>("target_id"),
                "details": row.get::<Option<String>, _>("details"),
                "created_at": row.get::<String, _>("created_at"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "logs": logs })))
}
