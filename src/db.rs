use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn seed(pool: &SqlitePool) -> anyhow::Result<()> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;

    let now = Utc::now().to_rfc3339();

    if count == 0 {
        let password = "admin123";
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| anyhow::anyhow!("Hash error: {}", e))?
            .to_string();

        let id = Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind("admin")
        .bind(None::<String>)
        .bind(&hash)
        .bind("admin")
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;

        tracing::info!("==============================================");
        tracing::info!("Admin user created: admin / {}", password);
        tracing::info!("==============================================");
    }

    let default_settings: &[(&str, &str, &str, bool)] = &[
        (
            "log_retention_days",
            "90",
            "Delete webhook logs older than N days (0 = keep forever)",
            false,
        ),
        (
            "audit_log_retention_days",
            "30",
            "Delete audit logs older than N days (0 = keep forever)",
            false,
        ),
    ];

    for (key, value, desc, hidden) in default_settings {
        sqlx::query(
            "INSERT OR IGNORE INTO settings (key, value, description, hidden, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(key)
        .bind(value)
        .bind(desc)
        .bind(hidden)
        .bind(&now)
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn backfill_webhook_tokens(pool: &SqlitePool) -> anyhow::Result<()> {
    let rows: Vec<String> =
        sqlx::query_scalar("SELECT id FROM repositories WHERE webhook_token IS NULL")
            .fetch_all(pool)
            .await?;

    for id in rows {
        let token = Uuid::new_v4().to_string();
        sqlx::query("UPDATE repositories SET webhook_token = ? WHERE id = ?")
            .bind(&token)
            .bind(&id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub async fn get_or_create_jwt_secret(pool: &SqlitePool) -> anyhow::Result<String> {
    let result: Option<String> =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = 'jwt_secret'")
            .fetch_optional(pool)
            .await?;

    if let Some(secret) = result {
        return Ok(secret);
    }

    let secret = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO settings (key, value, description, hidden, updated_at) VALUES ('jwt_secret', ?, 'Internal JWT signing secret', 1, ?)",
    )
    .bind(&secret)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(secret)
}
