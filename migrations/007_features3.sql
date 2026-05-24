ALTER TABLE users ADD COLUMN totp_backup_codes TEXT;

CREATE TABLE IF NOT EXISTS rate_limit (
    ip TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_start TEXT NOT NULL,
    PRIMARY KEY (ip, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit(window_start);
