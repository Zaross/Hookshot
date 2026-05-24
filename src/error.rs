use axum::{
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Forbidden")]
    Forbidden,
    #[error("Not found")]
    NotFound,
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Internal error: {0}")]
    Internal(String),
    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
    #[error("Too many requests")]
    TooManyRequests(u64),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if let AppError::TooManyRequests(retry_after) = self {
            let mut response = (
                StatusCode::TOO_MANY_REQUESTS,
                axum::Json(json!({ "error": "Too many requests. Try again later." })),
            )
                .into_response();
            let h = response.headers_mut();
            if let Ok(v) = HeaderValue::from_str(&retry_after.to_string()) {
                h.insert("retry-after", v);
            }
            h.insert("x-ratelimit-remaining", HeaderValue::from_static("0"));
            return response;
        }

        let (status, message) = match &self {
            AppError::Database(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "Forbidden".to_string()),
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found".to_string()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            AppError::Jwt(_) => (StatusCode::UNAUTHORIZED, "Invalid token".to_string()),
            AppError::TooManyRequests(_) => unreachable!(),
        };

        (status, axum::Json(json!({ "error": message }))).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
