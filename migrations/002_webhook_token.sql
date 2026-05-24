ALTER TABLE repositories ADD COLUMN webhook_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_webhook_token ON repositories(webhook_token);
