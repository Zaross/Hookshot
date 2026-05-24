use std::net::SocketAddr;
use std::sync::Arc;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordVerifier},
    Argon2,
};
use axum::{
    extract::{ConnectInfo, State},
    http::HeaderMap,
    Extension, Json,
};
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use rand_core::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use totp_rs::{Algorithm, Secret, TOTP};
use uuid::Uuid;

use utoipa::ToSchema;

use crate::{
    audit,
    error::{AppError, Result},
    middleware::real_client_ip,
    models::{Claims, User, UserResponse},
    state::AppState,
};

const MAX_FAILED_ATTEMPTS: i64 = 5;
const LOCKOUT_MINUTES: i64 = 15;
const IP_MAX_ATTEMPTS: i64 = 20;
const IP_WINDOW_SECS: i64 = 900;

#[derive(Deserialize, ToSchema)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize, ToSchema)]
#[serde(untagged)]
pub enum LoginResponse {
    Full { token: String, user: UserResponse },
    NeedsTotp { needs_2fa: bool, temp_token: String },
}

#[derive(Deserialize, ToSchema)]
pub struct TotpVerifyRequest {
    pub temp_token: String,
    pub code: String,
}

#[derive(Deserialize, ToSchema)]
pub struct UseBackupCodeRequest {
    pub temp_token: String,
    pub code: String,
}

#[derive(Deserialize, ToSchema)]
pub struct TotpEnableRequest {
    pub code: String,
}

#[derive(Deserialize, ToSchema)]
pub struct TotpDisableRequest {
    pub password: String,
    pub code: String,
}

fn make_jwt(state: &AppState, claims: &Claims) -> std::result::Result<String, AppError> {
    encode(
        &Header::default(),
        claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(Into::into)
}

async fn record_session(
    state: &AppState,
    user_id: &str,
    username: &str,
    jti: &str,
    expires_at: &str,
    user_agent: Option<&str>,
) {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let _ = sqlx::query(
        "INSERT INTO sessions (id, user_id, username, jti, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(username)
    .bind(jti)
    .bind(&now)
    .bind(expires_at)
    .bind(user_agent)
    .execute(&state.pool)
    .await;
}

async fn check_and_increment_ip_rate(
    pool: &SqlitePool,
    ip: &str,
    endpoint: &str,
    window_secs: i64,
) -> Result<(i64, u64)> {
    let window_cutoff = (Utc::now() - chrono::Duration::seconds(window_secs)).to_rfc3339();
    let now_str = Utc::now().to_rfc3339();

    sqlx::query("DELETE FROM rate_limit WHERE ip = ? AND endpoint = ? AND window_start < ?")
        .bind(ip)
        .bind(endpoint)
        .bind(&window_cutoff)
        .execute(pool)
        .await?;

    sqlx::query(
        "INSERT INTO rate_limit (ip, endpoint, attempts, window_start) VALUES (?, ?, 1, ?) \
         ON CONFLICT(ip, endpoint) DO UPDATE SET attempts = attempts + 1",
    )
    .bind(ip)
    .bind(endpoint)
    .bind(&now_str)
    .execute(pool)
    .await?;

    let row =
        sqlx::query("SELECT attempts, window_start FROM rate_limit WHERE ip = ? AND endpoint = ?")
            .bind(ip)
            .bind(endpoint)
            .fetch_one(pool)
            .await?;

    let attempts: i64 = row.get("attempts");
    let window_start: String = row.get("window_start");

    let ws_dt = chrono::DateTime::parse_from_rfc3339(&window_start)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let reset_ts = ws_dt.timestamp() + window_secs;
    let retry_after = (reset_ts - Utc::now().timestamp()).max(0) as u64;

    Ok((attempts, retry_after))
}

async fn reset_ip_rate(pool: &SqlitePool, ip: &str, endpoint: &str) {
    let _ = sqlx::query("DELETE FROM rate_limit WHERE ip = ? AND endpoint = ?")
        .bind(ip)
        .bind(endpoint)
        .execute(pool)
        .await;
}

fn generate_backup_codes() -> Vec<String> {
    let mut codes = Vec::with_capacity(8);
    for _ in 0..8 {
        let mut bytes = [0u8; 5];
        OsRng.fill_bytes(&mut bytes);
        codes.push(hex::encode(bytes).to_uppercase());
    }
    codes
}

fn hash_backup_code(code: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code.as_bytes());
    hex::encode(hasher.finalize())
}

fn verify_backup_code(code: &str, hash: &str) -> bool {
    let computed = hash_backup_code(code);
    if computed.len() != hash.len() {
        return false;
    }
    computed
        .as_bytes()
        .iter()
        .zip(hash.as_bytes().iter())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

#[utoipa::path(
    post,
    path = "/api/auth/login",
    tag = "auth",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Login successful or 2FA required", body = LoginResponse),
        (status = 401, description = "Invalid credentials"),
        (status = 429, description = "Too many requests"),
    )
)]
pub async fn login(
    State(state): State<Arc<AppState>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Result<Json<LoginResponse>> {
    let ip = real_client_ip(&peer, &headers);

    let (attempts, retry_after) =
        check_and_increment_ip_rate(&state.pool, &ip, "login", IP_WINDOW_SECS).await?;
    if attempts > IP_MAX_ATTEMPTS {
        return Err(AppError::TooManyRequests(retry_after));
    }

    let row = sqlx::query(
        "SELECT id, username, email, password_hash, role, totp_enabled, totp_secret, failed_attempts, locked_until, must_change_password, created_at, updated_at FROM users WHERE username = ?",
    )
    .bind(&body.username)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let locked_until: Option<String> = row.get("locked_until");
    if let Some(ref until) = locked_until {
        if until.as_str() > Utc::now().to_rfc3339().as_str() {
            return Err(AppError::BadRequest(
                "Account locked. Please try again later.".to_string(),
            ));
        }
    }

    let user = User {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        password_hash: row.get("password_hash"),
        role: row.get("role"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    };
    let totp_enabled: i64 = row.get("totp_enabled");
    let failed_attempts: i64 = row.get("failed_attempts");
    let must_change_password: i64 = row.get("must_change_password");

    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|_| AppError::Internal("Password hash error".to_string()))?;

    if Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed_hash)
        .is_err()
    {
        let new_attempts = failed_attempts + 1;
        if new_attempts >= MAX_FAILED_ATTEMPTS {
            let locked = (Utc::now() + chrono::Duration::minutes(LOCKOUT_MINUTES)).to_rfc3339();
            let _ =
                sqlx::query("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?")
                    .bind(new_attempts)
                    .bind(&locked)
                    .bind(&user.id)
                    .execute(&state.pool)
                    .await;
            audit::log(
                &state.pool,
                Some(&user.id),
                &user.username,
                "account_locked",
                None,
                None,
                None,
            )
            .await;
        } else {
            let _ = sqlx::query("UPDATE users SET failed_attempts = ? WHERE id = ?")
                .bind(new_attempts)
                .bind(&user.id)
                .execute(&state.pool)
                .await;
        }
        audit::log(
            &state.pool,
            Some(&user.id),
            &user.username,
            "login_failed",
            None,
            None,
            None,
        )
        .await;
        return Err(AppError::Unauthorized);
    }

    let _ = sqlx::query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?")
        .bind(&user.id)
        .execute(&state.pool)
        .await;

    audit::log(
        &state.pool,
        Some(&user.id),
        &user.username,
        "login",
        None,
        None,
        None,
    )
    .await;

    if totp_enabled != 0 {
        let jti = Uuid::new_v4().to_string();
        let exp = Utc::now().timestamp() + 300;
        let claims = Claims {
            sub: user.id.clone(),
            username: user.username.clone(),
            role: user.role.clone(),
            exp,
            jti,
            two_fa_pending: Some(true),
        };
        let temp_token = make_jwt(&state, &claims)?;
        return Ok(Json(LoginResponse::NeedsTotp {
            needs_2fa: true,
            temp_token,
        }));
    }

    let jti = Uuid::new_v4().to_string();
    let exp = Utc::now().timestamp() + 7 * 24 * 3600;
    let exp_rfc = (Utc::now() + chrono::Duration::seconds(7 * 24 * 3600)).to_rfc3339();
    let claims = Claims {
        sub: user.id.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        exp,
        jti: jti.clone(),
        two_fa_pending: None,
    };

    reset_ip_rate(&state.pool, &ip, "login").await;

    let token = make_jwt(&state, &claims)?;
    record_session(
        &state,
        &user.id,
        &user.username,
        &jti,
        &exp_rfc,
        user_agent.as_deref(),
    )
    .await;
    let mut user_resp = UserResponse::from(user);
    user_resp.must_change_password = Some(must_change_password != 0);
    Ok(Json(LoginResponse::Full {
        token,
        user: user_resp,
    }))
}

#[utoipa::path(
    post,
    path = "/api/auth/totp/verify",
    tag = "auth",
    request_body = TotpVerifyRequest,
    responses(
        (status = 200, description = "TOTP verified, returns token"),
        (status = 401, description = "Invalid code or token"),
        (status = 429, description = "Too many requests"),
    )
)]
pub async fn totp_verify(
    State(state): State<Arc<AppState>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<TotpVerifyRequest>,
) -> Result<Json<serde_json::Value>> {
    let ip = real_client_ip(&peer, &headers);

    let (attempts, retry_after) =
        check_and_increment_ip_rate(&state.pool, &ip, "totp", IP_WINDOW_SECS).await?;
    if attempts > IP_MAX_ATTEMPTS {
        return Err(AppError::TooManyRequests(retry_after));
    }

    let decoded = jsonwebtoken::decode::<Claims>(
        &body.temp_token,
        &jsonwebtoken::DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &jsonwebtoken::Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized)?;

    if decoded.claims.two_fa_pending != Some(true) {
        return Err(AppError::Unauthorized);
    }

    let user_id = &decoded.claims.sub;

    let row = sqlx::query(
        "SELECT id, username, email, password_hash, role, totp_secret, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let totp_secret: Option<String> = row.get("totp_secret");
    let secret_str = totp_secret.ok_or(AppError::Unauthorized)?;

    let totp = build_totp(&secret_str, &row.get::<String, _>("username"))
        .map_err(|_| AppError::Internal("TOTP error".to_string()))?;

    if !totp.check_current(&body.code).unwrap_or(false) {
        audit::log(
            &state.pool,
            Some(user_id),
            &decoded.claims.username,
            "totp_failed",
            None,
            None,
            None,
        )
        .await;
        return Err(AppError::Unauthorized);
    }

    reset_ip_rate(&state.pool, &ip, "totp").await;

    let user = User {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        password_hash: row.get("password_hash"),
        role: row.get("role"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    };

    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let jti = Uuid::new_v4().to_string();
    let exp = Utc::now().timestamp() + 7 * 24 * 3600;
    let exp_rfc = (Utc::now() + chrono::Duration::seconds(7 * 24 * 3600)).to_rfc3339();
    let claims = Claims {
        sub: user.id.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        exp,
        jti: jti.clone(),
        two_fa_pending: None,
    };
    let token = make_jwt(&state, &claims)?;
    record_session(
        &state,
        &user.id,
        &user.username,
        &jti,
        &exp_rfc,
        user_agent.as_deref(),
    )
    .await;

    Ok(Json(
        serde_json::json!({ "token": token, "user": UserResponse::from(user) }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/auth/totp/use-backup",
    tag = "auth",
    request_body = UseBackupCodeRequest,
    responses(
        (status = 200, description = "Backup code accepted, returns token"),
        (status = 401, description = "Invalid backup code or token"),
        (status = 429, description = "Too many requests"),
    )
)]
pub async fn use_backup_code(
    State(state): State<Arc<AppState>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<UseBackupCodeRequest>,
) -> Result<Json<serde_json::Value>> {
    let ip = real_client_ip(&peer, &headers);

    let (attempts, retry_after) =
        check_and_increment_ip_rate(&state.pool, &ip, "backup", IP_WINDOW_SECS).await?;
    if attempts > IP_MAX_ATTEMPTS {
        return Err(AppError::TooManyRequests(retry_after));
    }

    let decoded = jsonwebtoken::decode::<Claims>(
        &body.temp_token,
        &jsonwebtoken::DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &jsonwebtoken::Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized)?;

    if decoded.claims.two_fa_pending != Some(true) {
        return Err(AppError::Unauthorized);
    }

    let user_id = &decoded.claims.sub;

    let row = sqlx::query(
        "SELECT id, username, email, password_hash, role, totp_backup_codes, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let backup_codes_json: Option<String> = row.get("totp_backup_codes");
    let backup_codes_json = backup_codes_json.ok_or(AppError::Unauthorized)?;

    let code_hashes: Vec<String> =
        serde_json::from_str(&backup_codes_json).map_err(|_| AppError::Unauthorized)?;

    let normalized = body.code.trim().to_uppercase();
    let matching_idx = code_hashes
        .iter()
        .position(|h| verify_backup_code(&normalized, h));

    let idx = match matching_idx {
        Some(i) => i,
        None => {
            audit::log(
                &state.pool,
                Some(user_id),
                &decoded.claims.username,
                "backup_code_failed",
                None,
                None,
                None,
            )
            .await;
            return Err(AppError::Unauthorized);
        }
    };

    let mut remaining: Vec<String> = code_hashes;
    remaining.remove(idx);
    let remaining_json =
        serde_json::to_string(&remaining).map_err(|e| AppError::Internal(e.to_string()))?;

    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE users SET totp_backup_codes = ?, updated_at = ? WHERE id = ?")
        .bind(&remaining_json)
        .bind(&now)
        .bind(user_id)
        .execute(&state.pool)
        .await?;

    reset_ip_rate(&state.pool, &ip, "backup").await;

    audit::log(
        &state.pool,
        Some(user_id),
        &decoded.claims.username,
        "backup_code_used",
        None,
        None,
        Some(&format!("{} codes remaining", remaining.len())),
    )
    .await;

    let user = User {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        password_hash: row.get("password_hash"),
        role: row.get("role"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    };

    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let jti = Uuid::new_v4().to_string();
    let exp = Utc::now().timestamp() + 7 * 24 * 3600;
    let exp_rfc = (Utc::now() + chrono::Duration::seconds(7 * 24 * 3600)).to_rfc3339();
    let claims = Claims {
        sub: user.id.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        exp,
        jti: jti.clone(),
        two_fa_pending: None,
    };
    let token = make_jwt(&state, &claims)?;
    record_session(
        &state,
        &user.id,
        &user.username,
        &jti,
        &exp_rfc,
        user_agent.as_deref(),
    )
    .await;

    Ok(Json(
        serde_json::json!({ "token": token, "user": UserResponse::from(user) }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/auth/logout",
    tag = "auth",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "Logged out"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn logout(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>> {
    let now = Utc::now().to_rfc3339();
    let exp_ts = chrono::DateTime::from_timestamp(claims.exp, 0)
        .map(|d| d.to_rfc3339())
        .unwrap_or_else(|| now.clone());

    let _ = sqlx::query(
        "INSERT OR IGNORE INTO token_blacklist (jti, expires_at, revoked_at) VALUES (?, ?, ?)",
    )
    .bind(&claims.jti)
    .bind(&exp_ts)
    .bind(&now)
    .execute(&state.pool)
    .await;

    let _ = sqlx::query("DELETE FROM sessions WHERE jti = ?")
        .bind(&claims.jti)
        .execute(&state.pool)
        .await;

    audit::log(
        &state.pool,
        Some(&claims.sub),
        &claims.username,
        "logout",
        None,
        None,
        None,
    )
    .await;
    Ok(Json(serde_json::json!({ "success": true })))
}

#[utoipa::path(
    post,
    path = "/api/auth/totp/setup",
    tag = "auth",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "TOTP secret and OTP URI generated"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn totp_setup(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>> {
    let secret = Secret::generate_secret();
    let secret_b32 = secret.to_encoded().to_string();

    let totp = build_totp(&secret_b32, &claims.username)
        .map_err(|_| AppError::Internal("TOTP error".to_string()))?;
    let uri = totp.get_url();

    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE users SET totp_secret = ?, updated_at = ? WHERE id = ?")
        .bind(&secret_b32)
        .bind(&now)
        .bind(&claims.sub)
        .execute(&state.pool)
        .await?;

    Ok(Json(
        serde_json::json!({ "secret": secret_b32, "uri": uri }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/auth/totp/enable",
    tag = "auth",
    security(("Bearer" = [])),
    request_body = TotpEnableRequest,
    responses(
        (status = 200, description = "TOTP enabled, returns backup codes"),
        (status = 400, description = "Invalid code"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn totp_enable(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<TotpEnableRequest>,
) -> Result<Json<serde_json::Value>> {
    let row = sqlx::query("SELECT totp_secret FROM users WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let secret_str: Option<String> = row.get("totp_secret");
    let secret_str = secret_str
        .ok_or_else(|| AppError::BadRequest("No TOTP secret set. Call setup first.".to_string()))?;

    let totp = build_totp(&secret_str, &claims.username)
        .map_err(|_| AppError::Internal("TOTP error".to_string()))?;

    if !totp.check_current(&body.code).unwrap_or(false) {
        return Err(AppError::BadRequest("Invalid code".to_string()));
    }

    let plain_codes = generate_backup_codes();
    let hashed_codes: Vec<String> = plain_codes.iter().map(|c| hash_backup_code(c)).collect();
    let hashed_json =
        serde_json::to_string(&hashed_codes).map_err(|e| AppError::Internal(e.to_string()))?;

    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE users SET totp_enabled = 1, totp_backup_codes = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&hashed_json)
    .bind(&now)
    .bind(&claims.sub)
    .execute(&state.pool)
    .await?;

    audit::log(
        &state.pool,
        Some(&claims.sub),
        &claims.username,
        "2fa_enabled",
        None,
        None,
        None,
    )
    .await;
    Ok(Json(
        serde_json::json!({ "success": true, "backup_codes": plain_codes }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/auth/totp/disable",
    tag = "auth",
    security(("Bearer" = [])),
    request_body = TotpDisableRequest,
    responses(
        (status = 200, description = "TOTP disabled"),
        (status = 400, description = "Invalid password or code"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn totp_disable(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<TotpDisableRequest>,
) -> Result<Json<serde_json::Value>> {
    let row = sqlx::query("SELECT password_hash, totp_secret FROM users WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let hash: String = row.get("password_hash");
    let parsed =
        PasswordHash::new(&hash).map_err(|_| AppError::Internal("Hash error".to_string()))?;
    Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed)
        .map_err(|_| AppError::Unauthorized)?;

    let secret_str: Option<String> = row.get("totp_secret");
    if let Some(s) = secret_str {
        let totp = build_totp(&s, &claims.username)
            .map_err(|_| AppError::Internal("TOTP error".to_string()))?;
        if !totp.check_current(&body.code).unwrap_or(false) {
            return Err(AppError::BadRequest("Invalid code".to_string()));
        }
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup_codes = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(&claims.sub)
    .execute(&state.pool)
    .await?;

    audit::log(
        &state.pool,
        Some(&claims.sub),
        &claims.username,
        "2fa_disabled",
        None,
        None,
        None,
    )
    .await;
    Ok(Json(serde_json::json!({ "success": true })))
}

#[utoipa::path(
    get,
    path = "/api/auth/me",
    tag = "auth",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "Current user profile"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn me(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>> {
    let row = sqlx::query(
        "SELECT id, username, email, password_hash, role, totp_enabled, must_change_password, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(&claims.sub)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let user = User {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        password_hash: row.get("password_hash"),
        role: row.get("role"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    };
    let totp_enabled: i64 = row.get("totp_enabled");
    let must_change_password: i64 = row.get("must_change_password");

    Ok(Json(serde_json::json!({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "created_at": user.created_at,
        "totp_enabled": totp_enabled != 0,
        "must_change_password": must_change_password != 0,
    })))
}

#[utoipa::path(
    post,
    path = "/api/auth/stream-token",
    tag = "auth",
    security(("Bearer" = [])),
    responses(
        (status = 200, description = "One-time SSE stream token"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn create_stream_token(
    State(state): State<Arc<AppState>>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>> {
    let token = Uuid::new_v4().to_string();
    {
        let mut tokens = state.stream_tokens.lock().unwrap();
        tokens.retain(|_, created: &mut std::time::Instant| created.elapsed().as_secs() < 60);
        tokens.insert(token.clone(), std::time::Instant::now());
    }
    Ok(Json(serde_json::json!({ "token": token })))
}

fn build_totp(secret_b32: &str, username: &str) -> anyhow::Result<TOTP> {
    let bytes = Secret::Encoded(secret_b32.to_string())
        .to_bytes()
        .map_err(|e| anyhow::anyhow!("{:?}", e))?;
    TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        bytes,
        Some("Hookshot".to_string()),
        username.to_string(),
    )
    .map_err(|e| anyhow::anyhow!("{:?}", e))
}
