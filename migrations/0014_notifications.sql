PRAGMA foreign_keys = ON;

CREATE TABLE email_logs (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT REFERENCES shops(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  template TEXT NOT NULL CHECK (template IN (
    'booking_created','booking_confirmed','booking_cancelled','booking_completed','booking_reminder',
    'welcome','password_reset','payment_success','payment_failed','subscription_expiring','domain_verified','domain_failed'
  )),
  notification_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','SENDING','SENT','FAILED','RETRYABLE_FAILED')),
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX email_logs_shop_created_idx ON email_logs(shop_id, created_at DESC);
CREATE INDEX email_logs_status_created_idx ON email_logs(status, created_at);

INSERT INTO shop_settings(id,shop_id,key,value)
SELECT lower(hex(randomblob(16))),id,'booking_email_enabled','true' FROM shops WHERE 1
ON CONFLICT(shop_id,key) DO NOTHING;
INSERT INTO shop_settings(id,shop_id,key,value)
SELECT lower(hex(randomblob(16))),id,'owner_notification_enabled','true' FROM shops WHERE 1
ON CONFLICT(shop_id,key) DO NOTHING;
INSERT INTO shop_settings(id,shop_id,key,value)
SELECT lower(hex(randomblob(16))),id,'reminder_enabled','true' FROM shops WHERE 1
ON CONFLICT(shop_id,key) DO NOTHING;
INSERT INTO shop_settings(id,shop_id,key,value)
SELECT lower(hex(randomblob(16))),id,'payment_email_enabled','true' FROM shops WHERE 1
ON CONFLICT(shop_id,key) DO NOTHING;
