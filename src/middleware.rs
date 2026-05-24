use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::HeaderMap,
    middleware::Next,
    response::{IntoResponse, Response},
};
use chrono::Utc;
use jsonwebtoken::{decode, DecodingKey, Validation};

use crate::{error::AppError, models::Claims, state::AppState};

pub fn real_client_ip(peer: &SocketAddr, headers: &HeaderMap) -> String {
    let peer_ip = peer.ip();
    if is_local_proxy(peer_ip) {
        if let Some(ip) = headers
            .get("x-real-ip")
            .or_else(|| headers.get("x-forwarded-for"))
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split(',').next())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            return ip;
        }
    }
    peer_ip.to_string()
}

fn is_local_proxy(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => v4.is_loopback() || v4.is_private(),
        std::net::IpAddr::V6(v6) => v6.is_loopback(),
    }
}

pub async fn security_headers(req: Request, next: Next) -> impl IntoResponse {
    let mut response: Response = next.run(req).await;
    let h = response.headers_mut();
    h.insert("x-frame-options", "DENY".parse().unwrap());
    h.insert("x-content-type-options", "nosniff".parse().unwrap());
    h.insert(
        "referrer-policy",
        "strict-origin-when-cross-origin".parse().unwrap(),
    );
    h.insert(
        "strict-transport-security",
        "max-age=31536000; includeSubDomains".parse().unwrap(),
    );
    response
}

pub async fn decode_and_validate(state: &AppState, token: &str) -> Result<Claims, AppError> {
    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized)?
    .claims;

    if claims.two_fa_pending == Some(true) {
        return Err(AppError::Unauthorized);
    }

    let now = Utc::now().to_rfc3339();
    let blacklisted = sqlx::query("SELECT 1 FROM token_blacklist WHERE jti = ? AND expires_at > ?")
        .bind(&claims.jti)
        .bind(&now)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    if blacklisted.is_some() {
        return Err(AppError::Unauthorized);
    }

    Ok(claims)
}

pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = req
        .headers()
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?
        .to_string();

    let claims = decode_and_validate(&state, &token).await?;
    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

pub async fn require_admin(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = req
        .headers()
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?
        .to_string();

    let claims = decode_and_validate(&state, &token).await?;

    if claims.role != "admin" {
        return Err(AppError::Forbidden);
    }

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}
