-- Opaque server-side sessions and explicit account-to-barber profile mapping.
PRAGMA foreign_keys = ON;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT,
  FOREIGN KEY (user_id, shop_id) REFERENCES users(id, shop_id) ON DELETE CASCADE
);

CREATE TRIGGER sessions_scope_insert
BEFORE INSERT ON sessions
WHEN NOT EXISTS (
  SELECT 1 FROM users AS user
  WHERE user.id = NEW.user_id AND user.shop_id IS NEW.shop_id
)
BEGIN
  SELECT RAISE(ABORT, 'session shop scope must match its user');
END;

CREATE TRIGGER sessions_scope_update
BEFORE UPDATE OF user_id, shop_id ON sessions
WHEN NOT EXISTS (
  SELECT 1 FROM users AS user
  WHERE user.id = NEW.user_id AND user.shop_id IS NEW.shop_id
)
BEGIN
  SELECT RAISE(ABORT, 'session shop scope must match its user');
END;

CREATE TABLE barber_user_links (
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  barber_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (shop_id, user_id),
  UNIQUE (shop_id, barber_id),
  FOREIGN KEY (user_id, shop_id) REFERENCES users(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (barber_id, shop_id) REFERENCES barbers(id, shop_id) ON DELETE CASCADE
);

CREATE INDEX sessions_shop_user_expiry_idx ON sessions(shop_id, user_id, expires_at);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX barber_user_links_user_idx ON barber_user_links(user_id, shop_id);
