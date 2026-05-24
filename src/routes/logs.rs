use std::convert::Infallible;
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{AssertSqlSafe, Row};
use uuid::Uuid;

use utoipa::{IntoParams, ToSchema};

use crate::{
    error::{AppError, Result},
    models::{EmbedTemplate, WebhookLog},
    state::AppState,
    webhook_processor::{self, WebhookVars},
};

#[derive(Deserialize, IntoParams)]
pub struct LogsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub repository_id: Option<String>,
    pub status: Option<String>,
    pub platform: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct LogsResponse {
    pub logs: Vec<WebhookLog>,
    pub total: i64,
}

fn row_to_log(row: sqlx::sqlite::SqliteRow) -> WebhookLog {
    WebhookLog {
        id: row.get("id"),
        repository_id: row.get("repository_id"),
        platform: row.get("platform"),
        event_type: row.get("event_type"),
        payload: row.get("payload"),
        status: row.get("status"),
        error_message: row.get("error_message"),
        created_at: row.get("created_at"),
    }
}

#[utoipa::path(
    get,
    path = "/api/logs",
    tag = "logs",
    security(("Bearer" = [])),
    params(LogsQuery),
    responses(
        (status = 200, description = "Webhook logs", body = LogsResponse),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn list(
    State(state): State<Arc<AppState>>,
    Query(params): Query<LogsQuery>,
) -> Result<Json<LogsResponse>> {
    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let mut where_clauses = Vec::new();
    let mut count_where = Vec::new();

    if params.repository_id.is_some() {
        where_clauses.push("repository_id = ?");
        count_where.push("repository_id = ?");
    }
    if params.status.is_some() {
        where_clauses.push("status = ?");
        count_where.push("status = ?");
    }
    if params.platform.is_some() {
        where_clauses.push("platform = ?");
        count_where.push("platform = ?");
    }

    let where_str = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let query_str = format!(
        "SELECT id, repository_id, platform, event_type, payload, status, error_message, created_at FROM webhook_logs {} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        where_str
    );
    let count_str = format!("SELECT COUNT(*) FROM webhook_logs {}", where_str);

    let mut q = sqlx::query(AssertSqlSafe(query_str.as_str()));
    let mut count_q = sqlx::query_scalar::<_, i64>(AssertSqlSafe(count_str.as_str()));

    if let Some(ref rid) = params.repository_id {
        q = q.bind(rid);
        count_q = count_q.bind(rid);
    }
    if let Some(ref status) = params.status {
        q = q.bind(status);
        count_q = count_q.bind(status);
    }
    if let Some(ref platform) = params.platform {
        q = q.bind(platform);
        count_q = count_q.bind(platform);
    }

    q = q.bind(limit).bind(offset);

    let rows = q.fetch_all(&state.pool).await?;
    let total = count_q.fetch_one(&state.pool).await?;

    Ok(Json(LogsResponse {
        logs: rows.into_iter().map(row_to_log).collect(),
        total,
    }))
}

#[utoipa::path(
    post,
    path = "/api/logs/{id}/retry",
    tag = "logs",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "Webhook log ID")),
    responses(
        (status = 200, description = "Retry succeeded"),
        (status = 404, description = "Not found"),
    )
)]
pub async fn retry(
    State(state): State<Arc<AppState>>,
    Path(log_id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let log_row = sqlx::query(
        "SELECT repository_id, platform, event_type, payload FROM webhook_logs WHERE id = ?",
    )
    .bind(&log_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let repo_id: Option<String> = log_row.get("repository_id");
    let platform: String = log_row.get("platform");
    let event_type: String = log_row.get("event_type");
    let payload_str: String = log_row.get("payload");

    let repo_id = repo_id
        .ok_or_else(|| AppError::BadRequest("No repository linked to this log".to_string()))?;

    let repo_row = sqlx::query(
        "SELECT discord_webhook_url, embed_template, active, commit_filter FROM repositories WHERE id = ?",
    )
    .bind(&repo_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let active: i64 = repo_row.get("active");
    if active == 0 {
        return Err(AppError::BadRequest("Repository is inactive".to_string()));
    }

    let discord_url: String = repo_row.get("discord_webhook_url");
    let template_str: String = repo_row.get("embed_template");
    let commit_filter: Vec<String> = repo_row
        .get::<Option<String>, _>("commit_filter")
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let payload: serde_json::Value =
        serde_json::from_str(&payload_str).map_err(|e| AppError::Internal(e.to_string()))?;

    let is_github = platform == "github";

    let pusher_name = if is_github {
        payload["pusher"]["name"]
            .as_str()
            .unwrap_or("Unknown")
            .to_string()
    } else {
        payload["user_name"]
            .as_str()
            .unwrap_or("Unknown")
            .to_string()
    };
    let pusher_avatar = if is_github {
        payload["sender"]["avatar_url"]
            .as_str()
            .unwrap_or("")
            .to_string()
    } else {
        payload["user_avatar"].as_str().unwrap_or("").to_string()
    };
    let repo_name = if is_github {
        payload["repository"]["name"]
            .as_str()
            .unwrap_or("")
            .to_string()
    } else {
        payload["project"]["name"]
            .as_str()
            .unwrap_or("")
            .to_string()
    };
    let repo_full_name = if is_github {
        payload["repository"]["full_name"]
            .as_str()
            .unwrap_or("")
            .to_string()
    } else {
        payload["project"]["path_with_namespace"]
            .as_str()
            .unwrap_or("")
            .to_string()
    };
    let repo_url = if is_github {
        payload["repository"]["html_url"]
            .as_str()
            .unwrap_or("")
            .to_string()
    } else {
        payload["project"]["web_url"]
            .as_str()
            .unwrap_or("")
            .to_string()
    };
    let branch = payload["ref"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches("refs/heads/")
        .to_string();
    let commits = payload["commits"].as_array().cloned().unwrap_or_default();

    let now = Utc::now();
    let vars = WebhookVars {
        repo_name,
        repo_full_name,
        repo_url,
        pusher_name,
        pusher_avatar,
        branch,
        commit_count: commits.len(),
        added_commits: webhook_processor::format_commits(&commits, "added", &commit_filter),
        modified_commits: webhook_processor::format_commits(&commits, "modified", &commit_filter),
        removed_commits: webhook_processor::format_commits(&commits, "removed", &commit_filter),
        all_commits: webhook_processor::build_all_commits(&commits, &commit_filter),
        unix_timestamp: now.timestamp(),
    };

    let template: EmbedTemplate = serde_json::from_str(&template_str).unwrap_or_default();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let (status, error_msg) = match webhook_processor::send_to_discord(
        &client,
        &discord_url,
        &template,
        &vars,
        &now.to_rfc3339(),
    )
    .await
    {
        Ok(_) => ("success", None),
        Err(e) => ("failed", Some(e.to_string())),
    };

    let new_id = Uuid::new_v4().to_string();
    let ts = now.to_rfc3339();
    sqlx::query(
        "INSERT INTO webhook_logs (id, repository_id, platform, event_type, payload, status, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&new_id)
    .bind(&repo_id)
    .bind(&platform)
    .bind(&event_type)
    .bind(&payload_str)
    .bind(status)
    .bind(error_msg.as_deref())
    .bind(&ts)
    .execute(&state.pool)
    .await?;

    if status == "success" {
        Ok(Json(serde_json::json!({ "success": true })))
    } else {
        Err(AppError::Internal(error_msg.unwrap_or_default()))
    }
}

#[derive(Deserialize)]
pub struct StreamQuery {
    pub token: String,
}

pub async fn stream(
    State(state): State<Arc<AppState>>,
    Query(params): Query<StreamQuery>,
) -> Result<Sse<impl futures_core::Stream<Item = std::result::Result<Event, Infallible>>>> {
    let valid = {
        let mut tokens = state.stream_tokens.lock().unwrap();
        match tokens.remove(&params.token) {
            Some(created) => created.elapsed().as_secs() < 30,
            None => false,
        }
    };
    if !valid {
        return Err(AppError::Unauthorized);
    }

    let mut rx = state.log_tx.subscribe();

    let s = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(data) => yield Ok(Event::default().data(data)),
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    Ok(Sse::new(s).keep_alive(KeepAlive::default()))
}
