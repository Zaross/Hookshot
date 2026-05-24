use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use axum::Extension;

use utoipa::ToSchema;

use crate::{
    audit,
    error::{AppError, Result},
    models::{Claims, EmbedTemplate, Repository},
    state::AppState,
    webhook_processor::{self, WebhookVars},
};

#[derive(Deserialize, ToSchema)]
pub struct CreateRepositoryRequest {
    pub full_name: String,
    pub platform: String,
    pub secret: String,
    pub discord_webhook_url: String,
    pub embed_template: Option<serde_json::Value>,
    pub active: Option<bool>,
    pub allowed_branches: Option<Vec<String>>,
    pub commit_filter: Option<Vec<String>>,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateRepositoryRequest {
    pub full_name: Option<String>,
    pub platform: Option<String>,
    pub secret: Option<String>,
    pub discord_webhook_url: Option<String>,
    pub embed_template: Option<serde_json::Value>,
    pub active: Option<bool>,
    pub allowed_branches: Option<Vec<String>>,
    pub commit_filter: Option<Vec<String>>,
}

#[derive(Serialize, ToSchema)]
pub struct RepositoriesListResponse {
    pub repositories: Vec<Repository>,
}

fn validate_discord_url(url: &str) -> Result<()> {
    let allowed = [
        "https://discord.com/api/webhooks/",
        "https://discordapp.com/api/webhooks/",
        "https://ptb.discord.com/api/webhooks/",
        "https://canary.discord.com/api/webhooks/",
    ];
    if allowed.iter().any(|prefix| url.starts_with(prefix)) {
        Ok(())
    } else {
        Err(AppError::BadRequest(
            "Discord webhook URL must start with https://discord.com/api/webhooks/".to_string(),
        ))
    }
}

fn parse_str_vec(val: Option<String>) -> Vec<String> {
    val.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn row_to_repo(row: sqlx::sqlite::SqliteRow) -> Repository {
    let active_int: i64 = row.get("active");
    Repository {
        id: row.get("id"),
        full_name: row.get("full_name"),
        platform: row.get("platform"),
        secret: row.get("secret"),
        discord_webhook_url: row.get("discord_webhook_url"),
        embed_template: row.get("embed_template"),
        active: active_int != 0,
        webhook_token: row.get("webhook_token"),
        allowed_branches: parse_str_vec(row.get("allowed_branches")),
        commit_filter: parse_str_vec(row.get("commit_filter")),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

const SELECT_ALL: &str = "SELECT id, full_name, platform, secret, discord_webhook_url, embed_template, active, webhook_token, allowed_branches, commit_filter, created_at, updated_at FROM repositories ORDER BY created_at ASC";
const SELECT_ONE: &str = "SELECT id, full_name, platform, secret, discord_webhook_url, embed_template, active, webhook_token, allowed_branches, commit_filter, created_at, updated_at FROM repositories WHERE id = ?";

#[utoipa::path(
    get,
    path = "/api/repositories",
    tag = "repositories",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "Repository list", body = RepositoriesListResponse),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn list(State(state): State<Arc<AppState>>) -> Result<Json<RepositoriesListResponse>> {
    let rows = sqlx::query(SELECT_ALL).fetch_all(&state.pool).await?;
    Ok(Json(RepositoriesListResponse {
        repositories: rows.into_iter().map(row_to_repo).collect(),
    }))
}

#[utoipa::path(
    get,
    path = "/api/repositories/{id}",
    tag = "repositories",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "Repository ID")),
    responses(
        (status = 200, description = "Repository", body = Repository),
        (status = 404, description = "Not found"),
    )
)]
pub async fn get_one(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Repository>> {
    let row = sqlx::query(SELECT_ONE)
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(row_to_repo(row)))
}

#[utoipa::path(
    post,
    path = "/api/repositories",
    tag = "repositories",
    security(("Bearer" = [])),
    request_body = CreateRepositoryRequest,
    responses(
        (status = 200, description = "Repository created", body = Repository),
        (status = 400, description = "Invalid request"),
    )
)]
pub async fn create(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateRepositoryRequest>,
) -> Result<Json<Repository>> {
    if body.platform != "github" && body.platform != "gitlab" {
        return Err(AppError::BadRequest(
            "Platform must be 'github' or 'gitlab'".to_string(),
        ));
    }
    validate_discord_url(&body.discord_webhook_url)?;

    let default_template = serde_json::to_value(EmbedTemplate::default())
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let template = body.embed_template.unwrap_or(default_template);
    let template_str =
        serde_json::to_string(&template).map_err(|e| AppError::Internal(e.to_string()))?;

    let id = Uuid::new_v4().to_string();
    let webhook_token = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let active = body.active.unwrap_or(true) as i64;

    let branches_str = serde_json::to_string(&body.allowed_branches.unwrap_or_default())
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let filter_str = serde_json::to_string(&body.commit_filter.unwrap_or_default())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    sqlx::query(
        "INSERT INTO repositories (id, full_name, platform, secret, discord_webhook_url, embed_template, active, webhook_token, allowed_branches, commit_filter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.full_name)
    .bind(&body.platform)
    .bind(&body.secret)
    .bind(&body.discord_webhook_url)
    .bind(&template_str)
    .bind(active)
    .bind(&webhook_token)
    .bind(&branches_str)
    .bind(&filter_str)
    .bind(&now)
    .bind(&now)
    .execute(&state.pool)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            AppError::BadRequest("Repository already exists".to_string())
        } else {
            AppError::Database(e)
        }
    })?;

    let row = sqlx::query(SELECT_ONE)
        .bind(&id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(row_to_repo(row)))
}

#[utoipa::path(
    put,
    path = "/api/repositories/{id}",
    tag = "repositories",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "Repository ID")),
    request_body = UpdateRepositoryRequest,
    responses(
        (status = 200, description = "Updated repository", body = Repository),
        (status = 404, description = "Not found"),
    )
)]
pub async fn update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<UpdateRepositoryRequest>,
) -> Result<Json<Repository>> {
    let now = Utc::now().to_rfc3339();

    if let Some(ref platform) = body.platform {
        if platform != "github" && platform != "gitlab" {
            return Err(AppError::BadRequest(
                "Platform must be 'github' or 'gitlab'".to_string(),
            ));
        }
    }

    let existing = sqlx::query("SELECT id FROM repositories WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    if existing.is_none() {
        return Err(AppError::NotFound);
    }

    if let Some(ref v) = body.full_name {
        sqlx::query("UPDATE repositories SET full_name = ?, updated_at = ? WHERE id = ?")
            .bind(v)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref v) = body.platform {
        sqlx::query("UPDATE repositories SET platform = ?, updated_at = ? WHERE id = ?")
            .bind(v)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref v) = body.secret {
        sqlx::query("UPDATE repositories SET secret = ?, updated_at = ? WHERE id = ?")
            .bind(v)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref v) = body.discord_webhook_url {
        validate_discord_url(v)?;
        sqlx::query("UPDATE repositories SET discord_webhook_url = ?, updated_at = ? WHERE id = ?")
            .bind(v)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref template) = body.embed_template {
        let s = serde_json::to_string(template).map_err(|e| AppError::Internal(e.to_string()))?;
        sqlx::query("UPDATE repositories SET embed_template = ?, updated_at = ? WHERE id = ?")
            .bind(&s)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(active) = body.active {
        sqlx::query("UPDATE repositories SET active = ?, updated_at = ? WHERE id = ?")
            .bind(active as i64)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref v) = body.allowed_branches {
        let s = serde_json::to_string(v).map_err(|e| AppError::Internal(e.to_string()))?;
        sqlx::query("UPDATE repositories SET allowed_branches = ?, updated_at = ? WHERE id = ?")
            .bind(&s)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref v) = body.commit_filter {
        let s = serde_json::to_string(v).map_err(|e| AppError::Internal(e.to_string()))?;
        sqlx::query("UPDATE repositories SET commit_filter = ?, updated_at = ? WHERE id = ?")
            .bind(&s)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    let row = sqlx::query(SELECT_ONE)
        .bind(&id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(row_to_repo(row)))
}

#[utoipa::path(
    delete,
    path = "/api/repositories/{id}",
    tag = "repositories",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "Repository ID")),
    responses(
        (status = 200, description = "Deleted"),
        (status = 404, description = "Not found"),
    )
)]
pub async fn delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM repositories WHERE id = ?")
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
    path = "/api/repositories/{id}/regenerate-token",
    tag = "repositories",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "Repository ID")),
    responses(
        (status = 200, description = "New webhook token"),
        (status = 404, description = "Not found"),
    )
)]
pub async fn regenerate_token(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let exists = sqlx::query("SELECT id FROM repositories WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    let new_token = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE repositories SET webhook_token = ?, updated_at = ? WHERE id = ?")
        .bind(&new_token)
        .bind(&now)
        .bind(&id)
        .execute(&state.pool)
        .await?;

    audit::log(
        &state.pool,
        Some(&claims.sub),
        &claims.username,
        "regenerate_token",
        Some("repository"),
        Some(&id),
        None,
    )
    .await;

    Ok(Json(serde_json::json!({ "webhook_token": new_token })))
}

#[utoipa::path(
    get,
    path = "/api/repositories/export",
    tag = "repositories",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "All repositories as JSON export"),
    )
)]
pub async fn export(State(state): State<Arc<AppState>>) -> Result<Json<serde_json::Value>> {
    let rows = sqlx::query(SELECT_ALL).fetch_all(&state.pool).await?;
    let repos: Vec<Repository> = rows.into_iter().map(row_to_repo).collect();
    Ok(Json(
        serde_json::json!({ "repositories": repos, "exported_at": Utc::now().to_rfc3339() }),
    ))
}

#[derive(Deserialize, ToSchema)]
pub struct ImportRequest {
    pub repositories: Vec<serde_json::Value>,
}

#[utoipa::path(
    post,
    path = "/api/repositories/import",
    tag = "repositories",
    security(("Bearer" = [])),
    request_body = ImportRequest,
    responses(
        (status = 200, description = "Import result with counts"),
        (status = 400, description = "Invalid request"),
    )
)]
pub async fn import(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<ImportRequest>,
) -> Result<Json<serde_json::Value>> {
    if body.repositories.len() > 100 {
        return Err(AppError::BadRequest(
            "Cannot import more than 100 repositories at once".to_string(),
        ));
    }

    let mut imported = 0usize;
    let mut skipped = 0usize;

    for repo in &body.repositories {
        let full_name = repo["full_name"].as_str().unwrap_or("").to_string();
        let platform = repo["platform"].as_str().unwrap_or("github").to_string();
        let secret = repo["secret"].as_str().unwrap_or("").to_string();
        let discord_webhook_url = repo["discord_webhook_url"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let embed_template = serde_json::to_string(
            repo.get("embed_template")
                .unwrap_or(&serde_json::Value::Null),
        )
        .unwrap_or_else(|_| serde_json::to_string(&EmbedTemplate::default()).unwrap());
        let active = repo["active"].as_bool().unwrap_or(true) as i64;
        let allowed_branches = serde_json::to_string(
            repo.get("allowed_branches")
                .unwrap_or(&serde_json::json!([])),
        )
        .unwrap_or_else(|_| "[]".to_string());
        let commit_filter =
            serde_json::to_string(repo.get("commit_filter").unwrap_or(&serde_json::json!([])))
                .unwrap_or_else(|_| "[]".to_string());

        if full_name.is_empty() || discord_webhook_url.is_empty() {
            skipped += 1;
            continue;
        }
        if validate_discord_url(&discord_webhook_url).is_err() {
            skipped += 1;
            continue;
        }

        let id = Uuid::new_v4().to_string();
        let webhook_token = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let res = sqlx::query(
            "INSERT INTO repositories (id, full_name, platform, secret, discord_webhook_url, embed_template, active, webhook_token, allowed_branches, commit_filter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&full_name)
        .bind(&platform)
        .bind(&secret)
        .bind(&discord_webhook_url)
        .bind(&embed_template)
        .bind(active)
        .bind(&webhook_token)
        .bind(&allowed_branches)
        .bind(&commit_filter)
        .bind(&now)
        .bind(&now)
        .execute(&state.pool)
        .await;

        match res {
            Ok(_) => imported += 1,
            Err(_) => skipped += 1,
        }
    }

    audit::log(
        &state.pool,
        Some(&claims.sub),
        &claims.username,
        "import_repositories",
        None,
        None,
        Some(&format!("imported={imported}, skipped={skipped}")),
    )
    .await;

    Ok(Json(
        serde_json::json!({ "imported": imported, "skipped": skipped }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/repositories/bulk",
    tag = "repositories",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "Bulk action result"),
        (status = 400, description = "Invalid action or IDs"),
    )
)]
pub async fn bulk_action(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    let action = body["action"].as_str().unwrap_or("").to_string();
    let ids: Vec<String> = body["ids"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    if ids.is_empty() {
        return Err(AppError::BadRequest(
            "No repository IDs provided".to_string(),
        ));
    }
    if ids.len() > 500 {
        return Err(AppError::BadRequest(
            "Cannot perform bulk action on more than 500 repositories at once".to_string(),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let mut affected = 0u64;

    match action.as_str() {
        "activate" => {
            for id in &ids {
                let r =
                    sqlx::query("UPDATE repositories SET active = 1, updated_at = ? WHERE id = ?")
                        .bind(&now)
                        .bind(id)
                        .execute(&state.pool)
                        .await?;
                affected += r.rows_affected();
            }
        }
        "deactivate" => {
            for id in &ids {
                let r =
                    sqlx::query("UPDATE repositories SET active = 0, updated_at = ? WHERE id = ?")
                        .bind(&now)
                        .bind(id)
                        .execute(&state.pool)
                        .await?;
                affected += r.rows_affected();
            }
        }
        "delete" => {
            for id in &ids {
                let r = sqlx::query("DELETE FROM repositories WHERE id = ?")
                    .bind(id)
                    .execute(&state.pool)
                    .await?;
                affected += r.rows_affected();
            }
        }
        _ => return Err(AppError::BadRequest(format!("Unknown action: {action}"))),
    }

    audit::log(
        &state.pool,
        Some(&claims.sub),
        &claims.username,
        &format!("bulk_{action}"),
        Some("repositories"),
        None,
        Some(&format!("ids={}", ids.join(","))),
    )
    .await;

    Ok(Json(serde_json::json!({ "affected": affected })))
}

#[utoipa::path(
    post,
    path = "/api/repositories/{id}/test",
    tag = "repositories",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "Repository ID")),
    responses(
        (status = 200, description = "Test webhook sent"),
        (status = 404, description = "Not found"),
    )
)]
pub async fn test_webhook(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let row =
        sqlx::query("SELECT discord_webhook_url, embed_template FROM repositories WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(AppError::NotFound)?;

    let discord_url: String = row.get("discord_webhook_url");
    let template_str: String = row.get("embed_template");
    let template: EmbedTemplate = serde_json::from_str(&template_str).unwrap_or_default();

    let now = Utc::now();
    let vars = WebhookVars {
        repo_name: "TestRepo".to_string(),
        repo_full_name: "Good-Gaming-Community/TestRepo".to_string(),
        repo_url: "https://github.com/Good-Gaming-Community/TestRepo".to_string(),
        pusher_name: "TestUser".to_string(),
        pusher_avatar: "https://github.com/identicons/testuser.png".to_string(),
        branch: "main".to_string(),
        commit_count: 1,
        added_commits: "[`abc1234`](https://github.com) - feat: test commit - TestUser".to_string(),
        modified_commits: String::new(),
        removed_commits: String::new(),
        all_commits: "[`abc1234`](https://github.com) - feat: test commit - TestUser".to_string(),
        unix_timestamp: now.timestamp(),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    webhook_processor::send_to_discord(&client, &discord_url, &template, &vars, &now.to_rfc3339())
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "success": true })))
}
