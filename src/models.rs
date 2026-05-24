use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub password_hash: String,
    pub role: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct UserResponse {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub role: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub must_change_password: Option<bool>,
}

impl From<User> for UserResponse {
    fn from(u: User) -> Self {
        UserResponse {
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            created_at: u.created_at,
            must_change_password: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Repository {
    pub id: String,
    pub full_name: String,
    pub platform: String,
    pub secret: String,
    pub discord_webhook_url: String,
    pub embed_template: String,
    pub active: bool,
    pub webhook_token: String,
    pub allowed_branches: Vec<String>,
    pub commit_filter: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub description: Option<String>,
    pub hidden: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct WebhookLog {
    pub id: String,
    pub repository_id: Option<String>,
    pub platform: String,
    pub event_type: String,
    pub payload: String,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub username: String,
    pub role: String,
    pub exp: i64,
    pub jti: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub two_fa_pending: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, ToSchema)]
pub struct EmbedTemplate {
    pub title: Option<String>,
    pub description: Option<String>,
    pub color: Option<u32>,
    pub url: Option<String>,
    pub use_timestamp: Option<bool>,
    pub footer_text: Option<String>,
    pub footer_icon_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub image_url: Option<String>,
    pub author_name: Option<String>,
    pub author_url: Option<String>,
    pub author_icon_url: Option<String>,
}

impl Default for EmbedTemplate {
    fn default() -> Self {
        EmbedTemplate {
            title: Some("{{repo_name}}".to_string()),
            description: Some("**\u{1F680} Hinzugef\u{FC}gt:**\n{{added_commits}}\n\n**\u{1F4E6} Bearbeitet:**\n{{modified_commits}}\n\n**\u{26D4} Entfernt:**\n{{removed_commits}}".to_string()),
            color: Some(2287836),
            url: Some("{{repo_url}}".to_string()),
            use_timestamp: Some(true),
            footer_text: Some("{{pusher_name}}".to_string()),
            footer_icon_url: Some("{{pusher_avatar}}".to_string()),
            thumbnail_url: None,
            image_url: None,
            author_name: None,
            author_url: None,
            author_icon_url: None,
        }
    }
}
