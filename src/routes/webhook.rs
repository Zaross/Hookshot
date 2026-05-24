use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use axum::{
    body::Bytes,
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use sqlx::Row;
use uuid::Uuid;

use crate::{
    middleware::real_client_ip, models::EmbedTemplate, state::AppState, webhook_processor::*,
};

const WEBHOOK_MAX_PER_WINDOW: u32 = 120;
const WEBHOOK_WINDOW_SECS: u64 = 60;

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

async fn log_webhook(
    state: &AppState,
    repository_id: Option<&str>,
    platform: &str,
    event_type: &str,
    payload: &str,
    status: &str,
    error_message: Option<&str>,
) {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let ok = sqlx::query(
        "INSERT INTO webhook_logs (id, repository_id, platform, event_type, payload, status, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(repository_id)
    .bind(platform)
    .bind(event_type)
    .bind(payload)
    .bind(status)
    .bind(error_message)
    .bind(&now)
    .execute(&state.pool)
    .await;

    if ok.is_ok() {
        let meta = serde_json::json!({
            "id": id,
            "repository_id": repository_id,
            "platform": platform,
            "event_type": event_type,
            "status": status,
            "error_message": error_message,
            "created_at": now,
        });
        let _ = state.log_tx.send(meta.to_string());
    }
}

#[utoipa::path(
    post,
    path = "/webhook/{token}",
    tag = "webhooks",
    params(("token" = String, Path, description = "Repository webhook token")),
    request_body(content_type = "application/json", description = "GitHub or GitLab push event payload"),
    responses(
        (status = 200, description = "Webhook processed or skipped"),
        (status = 202, description = "Queued for retry"),
        (status = 400, description = "Invalid payload or unknown source"),
        (status = 401, description = "Invalid signature or token"),
        (status = 429, description = "Rate limit exceeded"),
    )
)]
pub async fn handle(
    State(state): State<Arc<AppState>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path(token): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let ip = real_client_ip(&peer, &headers);
    {
        let mut wr = state.webhook_rate.lock().unwrap();
        let entry = wr.entry(ip.clone()).or_insert((0, Instant::now()));
        if entry.1.elapsed().as_secs() >= WEBHOOK_WINDOW_SECS {
            *entry = (0, Instant::now());
        }
        entry.0 += 1;
        if entry.0 > WEBHOOK_MAX_PER_WINDOW {
            let retry_after = entry
                .1
                .checked_add(std::time::Duration::from_secs(WEBHOOK_WINDOW_SECS))
                .and_then(|reset| reset.checked_duration_since(Instant::now()))
                .map(|d| d.as_secs())
                .unwrap_or(WEBHOOK_WINDOW_SECS);
            let mut response = (
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({ "error": "Rate limit exceeded" })),
            )
                .into_response();
            let h = response.headers_mut();
            if let Ok(v) = axum::http::HeaderValue::from_str(&retry_after.to_string()) {
                h.insert("retry-after", v);
            }
            if let Ok(v) = axum::http::HeaderValue::from_str(&WEBHOOK_MAX_PER_WINDOW.to_string()) {
                h.insert("x-ratelimit-limit", v);
            }
            h.insert(
                "x-ratelimit-remaining",
                axum::http::HeaderValue::from_static("0"),
            );
            return response;
        }
    }

    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let is_github =
        user_agent.starts_with("GitHub-Hookshot") || headers.contains_key("x-github-event");
    let is_gitlab = headers.contains_key("x-gitlab-event");

    let platform = if is_github {
        "github"
    } else if is_gitlab {
        "gitlab"
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Unknown webhook source" })),
        )
            .into_response();
    };

    let payload_str = match std::str::from_utf8(&body) {
        Ok(s) => s.to_string(),
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Invalid body" })),
            )
                .into_response()
        }
    };

    let payload: serde_json::Value = match serde_json::from_str(&payload_str) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Invalid JSON" })),
            )
                .into_response()
        }
    };

    let event_type = if is_github {
        headers
            .get("x-github-event")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("push")
            .to_string()
    } else {
        headers
            .get("x-gitlab-event")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("Push Hook")
            .to_string()
    };

    let row = match sqlx::query(
        "SELECT id, secret, discord_webhook_url, embed_template, active, allowed_branches, commit_filter FROM repositories WHERE webhook_token = ?",
    )
    .bind(&token)
    .fetch_optional(&state.pool)
    .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Repository not configured" }))).into_response(),
        Err(e) => {
            tracing::error!("DB error: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Database error" }))).into_response();
        }
    };

    let repo_id: String = row.get("id");
    let secret: String = row.get("secret");
    let discord_url: String = row.get("discord_webhook_url");
    let template_str: String = row.get("embed_template");
    let active: i64 = row.get("active");
    let allowed_branches: Vec<String> = row
        .get::<Option<String>, _>("allowed_branches")
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let commit_filter: Vec<String> = row
        .get::<Option<String>, _>("commit_filter")
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    if event_type != "push" && event_type != "Push Hook" {
        log_webhook(
            &state,
            Some(&repo_id),
            platform,
            &event_type,
            &payload_str,
            "skipped",
            Some("Not a push event"),
        )
        .await;
        return (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "skipped" })),
        )
            .into_response();
    }

    if active == 0 {
        log_webhook(
            &state,
            Some(&repo_id),
            platform,
            &event_type,
            &payload_str,
            "skipped",
            Some("Repository inactive"),
        )
        .await;
        return (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "skipped" })),
        )
            .into_response();
    }

    if is_github {
        let sig = headers
            .get("x-hub-signature-256")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !verify_github_signature(&secret, &body, sig) {
            log_webhook(
                &state,
                Some(&repo_id),
                platform,
                &event_type,
                &payload_str,
                "failed",
                Some("Invalid signature"),
            )
            .await;
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Invalid signature" })),
            )
                .into_response();
        }
    } else if is_gitlab {
        let token_header = headers
            .get("x-gitlab-token")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !constant_time_eq(token_header.as_bytes(), secret.as_bytes()) {
            log_webhook(
                &state,
                Some(&repo_id),
                platform,
                &event_type,
                &payload_str,
                "failed",
                Some("Invalid token"),
            )
            .await;
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Invalid token" })),
            )
                .into_response();
        }
    }

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

    if pusher_name == "dependabot[bot]" {
        log_webhook(
            &state,
            Some(&repo_id),
            platform,
            &event_type,
            &payload_str,
            "skipped",
            Some("Dependabot push"),
        )
        .await;
        return (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "skipped" })),
        )
            .into_response();
    }

    let branch = payload["ref"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches("refs/heads/")
        .to_string();

    if !allowed_branches.is_empty() && !allowed_branches.iter().any(|b| b == &branch) {
        log_webhook(
            &state,
            Some(&repo_id),
            platform,
            &event_type,
            &payload_str,
            "skipped",
            Some(&format!("Branch '{}' not in allowed list", branch)),
        )
        .await;
        return (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "skipped" })),
        )
            .into_response();
    }

    let full_name = if is_github {
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

    let commits = payload["commits"].as_array().cloned().unwrap_or_default();

    let added_commits = format_commits(&commits, "added", &commit_filter);
    let modified_commits = format_commits(&commits, "modified", &commit_filter);
    let removed_commits = format_commits(&commits, "removed", &commit_filter);
    let all_commits = build_all_commits(&commits, &commit_filter);

    let now = Utc::now();
    let unix_timestamp = now.timestamp();
    let timestamp_iso = now.to_rfc3339();

    let vars = WebhookVars {
        repo_name,
        repo_full_name: full_name,
        repo_url,
        pusher_name,
        pusher_avatar,
        branch,
        commit_count: commits.len(),
        added_commits,
        modified_commits,
        removed_commits,
        all_commits,
        unix_timestamp,
    };

    let template: EmbedTemplate = serde_json::from_str(&template_str).unwrap_or_default();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap();

    match send_to_discord_with_state(
        &state,
        &client,
        &discord_url,
        &template,
        &vars,
        &timestamp_iso,
        Some(&repo_id),
    )
    .await
    {
        Ok(_) => {
            log_webhook(
                &state,
                Some(&repo_id),
                platform,
                &event_type,
                &payload_str,
                "success",
                None,
            )
            .await;
            (StatusCode::OK, Json(serde_json::json!({ "status": "ok" }))).into_response()
        }
        Err(e) => {
            let err_msg = e.to_string();
            tracing::warn!("Discord send failed (queued for retry): {}", err_msg);
            log_webhook(
                &state,
                Some(&repo_id),
                platform,
                &event_type,
                &payload_str,
                "failed",
                Some(&err_msg),
            )
            .await;
            (
                StatusCode::ACCEPTED,
                Json(serde_json::json!({ "status": "queued" })),
            )
                .into_response()
        }
    }
}
