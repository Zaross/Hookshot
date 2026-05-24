use std::sync::Arc;

use std::collections::HashMap;
use std::sync::Mutex;

use std::net::SocketAddr;

use axum::{
    http::{HeaderValue, Method},
    middleware::from_fn,
    routing::{get, post, put},
    Router,
};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
};

mod audit;
mod cleanup;
mod db;
mod error;
mod middleware;
mod models;
mod openapi;
mod queue;
mod routes;
mod state;
mod webhook_processor;

use openapi::ApiDoc;
use state::AppState;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "hookshot=info,tower_http=info".into());

    if std::env::var("LOG_FORMAT").as_deref() == Ok("json") {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(env_filter)
            .init();
    } else {
        tracing_subscriber::fmt().with_env_filter(env_filter).init();
    }

    std::fs::create_dir_all("data")?;

    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:data/app.db".to_string());

    let connect_opts = SqliteConnectOptions::from_str(&db_url)?.create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_opts)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    db::seed(&pool).await?;
    db::backfill_webhook_tokens(&pool).await?;

    let jwt_secret = db::get_or_create_jwt_secret(&pool).await?;

    let settings_cache = {
        use sqlx::Row;
        let rows = sqlx::query("SELECT key, value FROM settings")
            .fetch_all(&pool)
            .await?;
        let mut map = HashMap::new();
        for row in rows {
            map.insert(row.get::<String, _>("key"), row.get::<String, _>("value"));
        }
        std::sync::Arc::new(tokio::sync::RwLock::new(map))
    };

    tokio::spawn(queue::run_processor(pool.clone()));
    tokio::spawn(cleanup::run_log_cleanup(pool.clone()));

    let (log_tx, _) = tokio::sync::broadcast::channel::<String>(128);

    let state = Arc::new(AppState {
        pool,
        jwt_secret,
        discord_rate: std::sync::Arc::new(Mutex::new(HashMap::new())),
        webhook_rate: std::sync::Arc::new(Mutex::new(HashMap::new())),
        log_tx,
        stream_tokens: std::sync::Arc::new(Mutex::new(HashMap::new())),
        settings_cache,
    });

    let public_routes = Router::new()
        .route("/api/auth/login", post(routes::auth::login))
        .route("/api/auth/totp/verify", post(routes::auth::totp_verify))
        .route(
            "/api/auth/totp/use-backup",
            post(routes::auth::use_backup_code),
        )
        .route("/api/logs/stream", get(routes::logs::stream))
        .route("/webhook/{token}", post(routes::webhook::handle))
        .route("/health", get(routes::health::check))
        .route("/metrics", get(routes::metrics::metrics));

    use axum::routing::delete;

    let protected_routes = Router::new()
        .route("/api/auth/me", get(routes::auth::me))
        .route("/api/auth/logout", post(routes::auth::logout))
        .route("/api/auth/totp/setup", post(routes::auth::totp_setup))
        .route("/api/auth/totp/enable", post(routes::auth::totp_enable))
        .route("/api/auth/totp/disable", post(routes::auth::totp_disable))
        .route(
            "/api/auth/stream-token",
            post(routes::auth::create_stream_token),
        )
        .route("/api/sessions", get(routes::sessions::list))
        .route(
            "/api/sessions/revoke-others",
            post(routes::sessions::revoke_all_others),
        )
        .route("/api/sessions/{id}", delete(routes::sessions::revoke))
        .route("/api/stats", get(routes::stats::get))
        .route(
            "/api/repositories",
            get(routes::repositories::list).post(routes::repositories::create),
        )
        .route(
            "/api/repositories/{id}",
            get(routes::repositories::get_one)
                .put(routes::repositories::update)
                .delete(routes::repositories::delete),
        )
        .route(
            "/api/repositories/{id}/test",
            post(routes::repositories::test_webhook),
        )
        .route(
            "/api/repositories/{id}/regenerate-token",
            post(routes::repositories::regenerate_token),
        )
        .route(
            "/api/repositories/export",
            get(routes::repositories::export),
        )
        .route(
            "/api/repositories/import",
            post(routes::repositories::import),
        )
        .route(
            "/api/repositories/bulk",
            post(routes::repositories::bulk_action),
        )
        .route(
            "/api/settings",
            get(routes::settings::list).put(routes::settings::update_bulk),
        )
        .route("/api/logs", get(routes::logs::list))
        .route("/api/logs/{id}/retry", post(routes::logs::retry))
        .route(
            "/api/users/me/password",
            put(routes::users::change_own_password),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::require_auth,
        ));

    let admin_routes = Router::new()
        .route(
            "/api/users",
            get(routes::users::list).post(routes::users::create),
        )
        .route(
            "/api/users/{id}",
            put(routes::users::update).delete(routes::users::delete),
        )
        .route("/api/audit", get(routes::audit::list))
        .route("/api/queue", get(routes::queue_mgmt::list))
        .route(
            "/api/queue/purge-failed",
            post(routes::queue_mgmt::purge_failed),
        )
        .route("/api/queue/{id}/retry", post(routes::queue_mgmt::retry))
        .route("/api/queue/{id}", delete(routes::queue_mgmt::delete))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::require_admin,
        ));

    let swagger = SwaggerUi::new("/api/docs").url("/api/docs/openapi.json", ApiDoc::openapi());

    let api = public_routes
        .merge(protected_routes)
        .merge(admin_routes)
        .merge(swagger);

    let frontend_dir =
        std::env::var("FRONTEND_DIR").unwrap_or_else(|_| "frontend/dist".to_string());

    let cors_layer = {
        let base = CorsLayer::new().allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
        ]);
        match std::env::var("CORS_ORIGIN").ok().filter(|s| !s.is_empty()) {
            Some(origin) => match origin.parse::<HeaderValue>() {
                Ok(hv) => {
                    tracing::info!("CORS enabled for origin: {origin}");
                    base.allow_origin(hv).allow_headers([
                        axum::http::header::CONTENT_TYPE,
                        axum::http::header::AUTHORIZATION,
                    ])
                }
                Err(_) => {
                    tracing::warn!(
                        "CORS_ORIGIN is set but not a valid header value — CORS disabled"
                    );
                    base
                }
            },
            None => base,
        }
    };

    let app = api
        .fallback_service(
            ServeDir::new(&frontend_dir)
                .fallback(ServeFile::new(format!("{}/index.html", frontend_dir))),
        )
        .layer(from_fn(middleware::security_headers))
        .layer(cors_layer)
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);

    tracing::info!("Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    tracing::info!("Server shut down cleanly");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("Received Ctrl+C, shutting down"),
        _ = terminate => tracing::info!("Received SIGTERM, shutting down"),
    }
}
