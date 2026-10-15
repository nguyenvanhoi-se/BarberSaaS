-- Subscription history and retained audit records.
PRAGMA foreign_keys = ON;

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('BASIC', 'PRO', 'PREMIUM')),
  status TEXT NOT NULL CHECK (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED')),
  started_at TEXT NOT NULL,
  expired_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (expired_at IS NULL OR expired_at >= started_at)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT REFERENCES shops(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(trim(action)) > 0),
  entity TEXT NOT NULL CHECK (length(trim(entity)) > 0),
  entity_id TEXT,
  metadata TEXT CHECK (metadata IS NULL OR json_valid(metadata)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX subscriptions_shop_status_idx ON subscriptions(shop_id, status);
CREATE INDEX subscriptions_shop_expired_idx ON subscriptions(shop_id, expired_at);
CREATE INDEX audit_logs_shop_created_idx ON audit_logs(shop_id, created_at DESC);
CREATE INDEX audit_logs_user_created_idx ON audit_logs(user_id, created_at DESC);
