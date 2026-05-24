use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use sqlx::SqlitePool;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub jwt_secret: String,
    pub discord_rate: std::sync::Arc<Mutex<HashMap<String, Instant>>>,
    pub webhook_rate: std::sync::Arc<Mutex<HashMap<String, (u32, Instant)>>>,
    pub log_tx: tokio::sync::broadcast::Sender<String>,
    pub stream_tokens: std::sync::Arc<Mutex<HashMap<String, Instant>>>,
    pub settings_cache: std::sync::Arc<tokio::sync::RwLock<HashMap<String, String>>>,
}
