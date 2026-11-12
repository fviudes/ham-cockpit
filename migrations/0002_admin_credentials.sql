-- Credenciais de admin no D1 (usuário + senha). Ver docs/portal.md.
-- adminConfigured = existe pelo menos um usuário ativo com username e password_hash.

ALTER TABLE admin_users ADD COLUMN username TEXT;
ALTER TABLE admin_users ADD COLUMN password_hash TEXT;
ALTER TABLE admin_users ADD COLUMN totp_secret TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_username
  ON admin_users (username)
  WHERE username IS NOT NULL;
