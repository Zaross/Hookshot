use std::sync::Arc;

use axum::extract::Path;
use axum::{extract::State, Extension, Json};
use chrono::Utc;
use sqlx::Row;

use crate::{
    error::{AppError, Result},
    models::Claims,
    state::AppState,
};

#[utoipa::path(
    get,
    path = "/api/sessions",
    tag = "sessions",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "Active sessions for current user"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn list(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>> {
    let rows = sqlx::query(
        "SELECT id, jti, created_at, expires_at, user_agent FROM sessions WHERE user_id = ? ORDER BY created_at DESC",
    )
    .bind(&claims.sub)
    .fetch_all(&state.pool)
    .await?;

    let sessions: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            let jti: String = row.get("jti");
            let is_current = jti == claims.jti;
            serde_json::json!({
                "id": row.get::<String, _>("id"),
                "created_at": row.get::<String, _>("created_at"),
                "expires_at": row.get::<String, _>("expires_at"),
                "user_agent": row.get::<Option<String>, _>("user_agent"),
                "is_current": is_current,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "sessions": sessions })))
}

#[utoipa::path(
    delete,
    path = "/api/sessions/{id}",
    tag = "sessions",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "Session ID")),
    responses(
        (status = 200, description = "Session revoked"),
        (status = 404, description = "Not found"),
    )
)]
pub async fn revoke(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let row = sqlx::query("SELECT jti, expires_at FROM sessions WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&claims.sub)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let jti: String = row.get("jti");
    let expires_at: String = row.get("expires_at");
    let now = Utc::now().to_rfc3339();

    let _ = sqlx::query(
        "INSERT OR IGNORE INTO token_blacklist (jti, expires_at, revoked_at) VALUES (?, ?, ?)",
    )
    .bind(&jti)
    .bind(&expires_at)
    .bind(&now)
    .execute(&state.pool)
    .await;

    sqlx::query("DELETE FROM sessions WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

#[utoipa::path(
    post,
    path = "/api/sessions/revoke-others",
    tag = "sessions",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "All other sessions revoked"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn revoke_all_others(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>> {
    let rows = sqlx::query("SELECT jti, expires_at FROM sessions WHERE user_id = ? AND jti != ?")
        .bind(&claims.sub)
        .bind(&claims.jti)
        .fetch_all(&state.pool)
        .await?;

    let now = Utc::now().to_rfc3339();
    let mut revoked = 0usize;
    for row in &rows {
        let jti: String = row.get("jti");
        let expires_at: String = row.get("expires_at");
        let _ = sqlx::query(
            "INSERT OR IGNORE INTO token_blacklist (jti, expires_at, revoked_at) VALUES (?, ?, ?)",
        )
        .bind(&jti)
        .bind(&expires_at)
        .bind(&now)
        .execute(&state.pool)
        .await;
        revoked += 1;
    }

    sqlx::query("DELETE FROM sessions WHERE user_id = ? AND jti != ?")
        .bind(&claims.sub)
        .bind(&claims.jti)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "revoked": revoked })))
}
