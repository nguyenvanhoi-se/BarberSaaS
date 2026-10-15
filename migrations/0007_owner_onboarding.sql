-- One-time owner onboarding links; only token hashes are retained.
PRAGMA foreign_keys = ON;

CREATE TABLE owner_invites (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id)
);

CREATE INDEX owner_invites_shop_expiry_idx ON owner_invites(shop_id, expires_at);
CREATE INDEX users_role_status_created_idx ON users(role, status, created_at DESC);
CREATE INDEX subscriptions_status_expiry_idx ON subscriptions(status, expired_at);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);
