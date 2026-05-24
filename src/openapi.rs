use utoipa::{
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
    Modify, OpenApi,
};

use crate::{
    models::{EmbedTemplate, Repository, Setting, UserResponse, WebhookLog},
    routes::{
        auth::{
            LoginRequest, LoginResponse, TotpDisableRequest, TotpEnableRequest, TotpVerifyRequest,
            UseBackupCodeRequest,
        },
        logs::LogsResponse,
        repositories::{
            CreateRepositoryRequest, ImportRequest, RepositoriesListResponse,
            UpdateRepositoryRequest,
        },
        settings::{SettingsResponse, UpdateSettingEntry, UpdateSettingsRequest},
        users::{ChangePasswordRequest, CreateUserRequest, UpdateUserRequest, UsersListResponse},
    },
};

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "Bearer",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .bearer_format("JWT")
                    .build(),
            ),
        );
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Hookshot API",
        version = "1.0.0",
        description = "GitHub/GitLab → Discord webhook bridge",
    ),
    paths(
        crate::routes::auth::login,
        crate::routes::auth::totp_verify,
        crate::routes::auth::use_backup_code,
        crate::routes::auth::me,
        crate::routes::auth::logout,
        crate::routes::auth::totp_setup,
        crate::routes::auth::totp_enable,
        crate::routes::auth::totp_disable,
        crate::routes::auth::create_stream_token,
        crate::routes::health::check,
        crate::routes::metrics::metrics,
        crate::routes::repositories::list,
        crate::routes::repositories::get_one,
        crate::routes::repositories::create,
        crate::routes::repositories::update,
        crate::routes::repositories::delete,
        crate::routes::repositories::test_webhook,
        crate::routes::repositories::regenerate_token,
        crate::routes::repositories::export,
        crate::routes::repositories::import,
        crate::routes::repositories::bulk_action,
        crate::routes::settings::list,
        crate::routes::settings::update_bulk,
        crate::routes::logs::list,
        crate::routes::logs::retry,
        crate::routes::users::list,
        crate::routes::users::create,
        crate::routes::users::update,
        crate::routes::users::delete,
        crate::routes::users::change_own_password,
        crate::routes::sessions::list,
        crate::routes::sessions::revoke,
        crate::routes::sessions::revoke_all_others,
        crate::routes::stats::get,
        crate::routes::audit::list,
        crate::routes::queue_mgmt::list,
        crate::routes::queue_mgmt::retry,
        crate::routes::queue_mgmt::delete,
        crate::routes::queue_mgmt::purge_failed,
        crate::routes::webhook::handle,
    ),
    components(
        schemas(
            UserResponse,
            Repository,
            WebhookLog,
            Setting,
            EmbedTemplate,
            LoginRequest,
            LoginResponse,
            TotpVerifyRequest,
            UseBackupCodeRequest,
            TotpEnableRequest,
            TotpDisableRequest,
            RepositoriesListResponse,
            CreateRepositoryRequest,
            UpdateRepositoryRequest,
            ImportRequest,
            SettingsResponse,
            UpdateSettingEntry,
            UpdateSettingsRequest,
            LogsResponse,
            UsersListResponse,
            CreateUserRequest,
            UpdateUserRequest,
            ChangePasswordRequest,
        )
    ),
    modifiers(&SecurityAddon),
    tags(
        (name = "auth", description = "Authentication & TOTP"),
        (name = "repositories", description = "Repository management"),
        (name = "settings", description = "Application settings"),
        (name = "logs", description = "Webhook logs"),
        (name = "users", description = "User management (admin)"),
        (name = "sessions", description = "Session management"),
        (name = "stats", description = "Delivery statistics"),
        (name = "audit", description = "Audit log (admin)"),
        (name = "queue", description = "Retry queue (admin)"),
        (name = "system", description = "Health & metrics"),
        (name = "webhooks", description = "Incoming webhook receiver"),
    )
)]
pub struct ApiDoc;
