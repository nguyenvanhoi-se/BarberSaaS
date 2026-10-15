PRAGMA foreign_keys = ON;

ALTER TABLE subscriptions ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'MONTHLY'
  CHECK (billing_interval IN ('MONTHLY','YEARLY'));
ALTER TABLE subscriptions ADD COLUMN trial_started_at TEXT;
ALTER TABLE subscriptions ADD COLUMN trial_expired_at TEXT;

-- Existing shops get an explicit subscription; subscriptions remain the plan source of truth.
INSERT INTO subscriptions(id,shop_id,plan,status,started_at,expired_at,trial_started_at,trial_expired_at)
SELECT lower(hex(randomblob(16))),s.id,s.plan,'ACTIVE',s.created_at,NULL,NULL,NULL
FROM shops s WHERE NOT EXISTS (SELECT 1 FROM subscriptions sub WHERE sub.shop_id=s.id);

CREATE INDEX subscriptions_current_idx ON subscriptions(shop_id,created_at DESC,status);
CREATE INDEX bookings_shop_month_status_idx ON bookings(shop_id,booking_date,status);
