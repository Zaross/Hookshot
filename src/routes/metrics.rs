use std::sync::Arc;

use axum::{extract::State, http::StatusCode, response::IntoResponse};

use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/metrics",
    tag = "system",
    responses(
        (status = 200, description = "Prometheus metrics in text/plain format"),
    )
)]
pub async fn metrics(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let webhooks_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM webhook_logs")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let webhooks_success: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM webhook_logs WHERE status = 'success'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let webhooks_failed: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM webhook_logs WHERE status = 'failed'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let webhooks_skipped: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM webhook_logs WHERE status = 'skipped'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let queue_pending: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM webhook_queue WHERE status = 'pending'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let queue_failed: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM webhook_queue WHERE status = 'failed'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let repos_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM repositories")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let repos_active: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM repositories WHERE active = 1")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let users_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let body = format!(
        "# HELP hookshot_webhooks_total Total webhook log entries\n\
         # TYPE hookshot_webhooks_total gauge\n\
         hookshot_webhooks_total {webhooks_total}\n\
         # HELP hookshot_webhooks_by_status Webhook entries grouped by outcome\n\
         # TYPE hookshot_webhooks_by_status gauge\n\
         hookshot_webhooks_by_status{{status=\"success\"}} {webhooks_success}\n\
         hookshot_webhooks_by_status{{status=\"failed\"}} {webhooks_failed}\n\
         hookshot_webhooks_by_status{{status=\"skipped\"}} {webhooks_skipped}\n\
         # HELP hookshot_queue_depth Current retry queue size\n\
         # TYPE hookshot_queue_depth gauge\n\
         hookshot_queue_depth{{status=\"pending\"}} {queue_pending}\n\
         hookshot_queue_depth{{status=\"failed\"}} {queue_failed}\n\
         # HELP hookshot_repositories Repository count\n\
         # TYPE hookshot_repositories gauge\n\
         hookshot_repositories{{state=\"total\"}} {repos_total}\n\
         hookshot_repositories{{state=\"active\"}} {repos_active}\n\
         # HELP hookshot_users_total Total user accounts\n\
         # TYPE hookshot_users_total gauge\n\
         hookshot_users_total {users_total}\n"
    );

    (
        StatusCode::OK,
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )],
        body,
    )
        .into_response()
}
