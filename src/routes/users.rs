use std::sync::Arc;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use axum::{
    extract::{Path, State},
    Extension, Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use utoipa::ToSchema;

use crate::{
    error::{AppError, Result},
    models::{Claims, User, UserResponse},
    state::AppState,
};

#[derive(Deserialize, ToSchema)]
pub struct CreateUserRequest {
    pub username: String,
    pub email: Option<String>,
    pub password: String,
    pub role: String,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub email: Option<String>,
    pub password: Option<String>,
    pub role: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Serialize, ToSchema)]
pub struct UsersListResponse {
    pub users: Vec<UserResponse>,
}

fn row_to_user(row: sqlx::sqlite::SqliteRow) -> User {
    User {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        password_hash: row.get("password_hash"),
        role: row.get("role"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

#[utoipa::path(
    get,
    path = "/api/users",
    tag = "users",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "User list", body = UsersListResponse),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn list(State(state): State<Arc<AppState>>) -> Result<Json<UsersListResponse>> {
    let rows = sqlx::query(
        "SELECT id, username, email, password_hash, role, created_at, updated_at FROM users ORDER BY created_at ASC",
    )
    .fetch_all(&state.pool)
    .await?;

    let users = rows
        .into_iter()
        .map(|r| UserResponse::from(row_to_user(r)))
        .collect();

    Ok(Json(UsersListResponse { users }))
}

#[utoipa::path(
    post,
    path = "/api/users",
    tag = "users",
    security(("Bearer" = [])),
    request_body = CreateUserRequest,
    responses(
        (status = 200, description = "Created user", body = UserResponse),
        (status = 400, description = "Invalid request"),
    )
)]
pub async fn create(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateUserRequest>,
) -> Result<Json<UserResponse>> {
    if body.role != "admin" && body.role != "user" {
        return Err(AppError::BadRequest(
            "Role must be 'admin' or 'user'".to_string(),
        ));
    }
    if body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(body.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(e.to_string()))?
        .to_string();

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.username)
    .bind(&body.email)
    .bind(&hash)
    .bind(&body.role)
    .bind(&now)
    .bind(&now)
    .execute(&state.pool)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            AppError::BadRequest("Username or email already exists".to_string())
        } else {
            AppError::Database(e)
        }
    })?;

    let row = sqlx::query(
        "SELECT id, username, email, password_hash, role, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(UserResponse::from(row_to_user(row))))
}

#[utoipa::path(
    put,
    path = "/api/users/{id}",
    tag = "users",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "User ID")),
    request_body = UpdateUserRequest,
    responses(
        (status = 200, description = "Updated user", body = UserResponse),
        (status = 404, description = "Not found"),
    )
)]
pub async fn update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<UpdateUserRequest>,
) -> Result<Json<UserResponse>> {
    let now = Utc::now().to_rfc3339();

    if let Some(ref role) = body.role {
        if role != "admin" && role != "user" {
            return Err(AppError::BadRequest(
                "Role must be 'admin' or 'user'".to_string(),
            ));
        }
    }

    if let Some(ref password) = body.password {
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| AppError::Internal(e.to_string()))?
            .to_string();

        sqlx::query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
            .bind(&hash)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(ref username) = body.username {
        sqlx::query("UPDATE users SET username = ?, updated_at = ? WHERE id = ?")
            .bind(username)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(ref email) = body.email {
        sqlx::query("UPDATE users SET email = ?, updated_at = ? WHERE id = ?")
            .bind(email)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(ref role) = body.role {
        sqlx::query("UPDATE users SET role = ?, updated_at = ? WHERE id = ?")
            .bind(role)
            .bind(&now)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    let row = sqlx::query(
        "SELECT id, username, email, password_hash, role, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(UserResponse::from(row_to_user(row))))
}

#[utoipa::path(
    delete,
    path = "/api/users/{id}",
    tag = "users",
    security(("Bearer" = [])),
    params(("id" = String, Path, description = "User ID")),
    responses(
        (status = 200, description = "Deleted"),
        (status = 404, description = "Not found"),
    )
)]
pub async fn delete(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    if claims.sub == id {
        return Err(AppError::BadRequest(
            "Cannot delete own account".to_string(),
        ));
    }

    let result = sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

#[utoipa::path(
    put,
    path = "/api/users/me/password",
    tag = "users",
    security(("Bearer" = [])),
    request_body = ChangePasswordRequest,
    responses(
        (status = 200, description = "Password changed"),
        (status = 401, description = "Wrong current password"),
    )
)]
pub async fn change_own_password(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<ChangePasswordRequest>,
) -> Result<Json<serde_json::Value>> {
    let row = sqlx::query(
        "SELECT id, username, email, password_hash, role, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(&claims.sub)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let user = row_to_user(row);

    let parsed_hash = argon2::password_hash::PasswordHash::new(&user.password_hash)
        .map_err(|_| AppError::Internal("Hash error".to_string()))?;

    argon2::password_hash::PasswordVerifier::verify_password(
        &Argon2::default(),
        body.current_password.as_bytes(),
        &parsed_hash,
    )
    .map_err(|_| AppError::Unauthorized)?;

    if body.new_password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(body.new_password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(e.to_string()))?
        .to_string();

    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?",
    )
    .bind(&hash)
    .bind(&now)
    .bind(&claims.sub)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
