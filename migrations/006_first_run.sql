ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

-- Mark the seeded admin as needing a password change on first login
UPDATE users SET must_change_password = 1 WHERE username = 'admin' AND password_hash LIKE '$argon2%';
