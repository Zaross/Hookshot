use std::sync::Arc;

use axum::{extract::State, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use utoipa::ToSchema;

use crate::{error::Result, models::Setting, state::AppState};

#[derive(Serialize, ToSchema)]
pub struct SettingsResponse {
    pub settings: Vec<Setting>,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateSettingEntry {
    pub key: String,
    pub value: String,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateSettingsRequest {
    pub settings: Vec<UpdateSettingEntry>,
}

fn row_to_setting(row: sqlx::sqlite::SqliteRow) -> Setting {
    let hidden_int: i64 = row.get("hidden");
    Setting {
        key: row.get("key"),
        value: row.get("value"),
        description: row.get("description"),
        hidden: hidden_int != 0,
        updated_at: row.get("updated_at"),
    }
}

#[utoipa::path(
    get,
    path = "/api/settings",
    tag = "settings",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "All visible settings", body = SettingsResponse),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn list(State(state): State<Arc<AppState>>) -> Result<Json<SettingsResponse>> {
    let rows = sqlx::query(
        "SELECT key, value, description, hidden, updated_at FROM settings WHERE hidden = 0 ORDER BY key ASC",
    )
    .fetch_all(&state.pool)
    .await?;

    let settings = rows.into_iter().map(row_to_setting).collect();

    Ok(Json(SettingsResponse { settings }))
}

#[utoipa::path(
    put,
    path = "/api/settings",
    tag = "settings",
    security(("Bearer" = [])),
    request_body = UpdateSettingsRequest,
    responses(
        (status = 200, description = "Updated settings", body = SettingsResponse),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn update_bulk(
    State(state): State<Arc<AppState>>,
    Json(body): Json<UpdateSettingsRequest>,
) -> Result<Json<SettingsResponse>> {
    let now = Utc::now().to_rfc3339();

    for entry in &body.settings {
        sqlx::query("UPDATE settings SET value = ?, updated_at = ? WHERE key = ? AND hidden = 0")
            .bind(&entry.value)
            .bind(&now)
            .bind(&entry.key)
            .execute(&state.pool)
            .await?;
    }

    let rows = sqlx::query(
        "SELECT key, value, description, hidden, updated_at FROM settings WHERE hidden = 0 ORDER BY key ASC",
    )
    .fetch_all(&state.pool)
    .await?;

    let all_rows = sqlx::query("SELECT key, value FROM settings")
        .fetch_all(&state.pool)
        .await?;

    {
        let mut cache = state.settings_cache.write().await;
        cache.clear();
        for row in &all_rows {
            cache.insert(row.get::<String, _>("key"), row.get::<String, _>("value"));
        }
    }

    let settings = rows.into_iter().map(row_to_setting).collect();

    Ok(Json(SettingsResponse { settings }))
}
