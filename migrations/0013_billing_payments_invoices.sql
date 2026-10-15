PRAGMA foreign_keys = ON;

ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1));
ALTER TABLE subscriptions ADD COLUMN scheduled_plan TEXT CHECK (scheduled_plan IS NULL OR scheduled_plan IN ('BASIC', 'PRO', 'PREMIUM'));
ALTER TABLE subscriptions ADD COLUMN scheduled_billing_interval TEXT CHECK (scheduled_billing_interval IS NULL OR scheduled_billing_interval IN ('MONTHLY', 'YEARLY'));
CREATE UNIQUE INDEX subscriptions_id_shop_unique ON subscriptions(id, shop_id);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('BASIC', 'PRO', 'PREMIUM')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('MONTHLY', 'YEARLY')),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  tax_amount INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  amount INTEGER NOT NULL CHECK (amount = subtotal + tax_amount),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'OPEN', 'PAID', 'VOID', 'OVERDUE')),
  issued_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  paid_at TEXT,
  details_json TEXT NOT NULL CHECK (json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, shop_id),
  FOREIGN KEY (subscription_id, shop_id) REFERENCES subscriptions(id, shop_id) ON DELETE RESTRICT
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 32),
  provider_payment_id TEXT,
  provider_reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
  payment_method TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, shop_id),
  FOREIGN KEY (invoice_id, shop_id) REFERENCES invoices(id, shop_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX payments_provider_transaction_unique
  ON payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX payments_one_inflight_per_invoice
  ON payments(invoice_id) WHERE status IN ('PENDING', 'PROCESSING');
CREATE INDEX payments_shop_created_idx ON payments(shop_id, created_at DESC, id);
CREATE INDEX payments_invoice_idx ON payments(invoice_id, created_at DESC);
CREATE INDEX payments_subscription_idx ON payments(subscription_id, created_at DESC);
CREATE INDEX invoices_shop_issued_idx ON invoices(shop_id, issued_at DESC, id);
CREATE INDEX invoices_subscription_idx ON invoices(subscription_id, issued_at DESC);
CREATE INDEX invoices_status_due_idx ON invoices(status, due_at);

CREATE TABLE payment_webhooks (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 32),
  event_id TEXT,
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) BETWEEN 1 AND 120),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED')),
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX payment_webhooks_event_unique
  ON payment_webhooks(provider, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX payment_webhooks_status_created_idx ON payment_webhooks(status, created_at);

CREATE TRIGGER payments_invoice_tenant_guard_insert
BEFORE INSERT ON payments
WHEN NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = NEW.invoice_id AND i.shop_id = NEW.shop_id AND i.subscription_id = NEW.subscription_id AND i.amount=NEW.amount AND i.currency=NEW.currency)
BEGIN
  SELECT RAISE(ABORT, 'payment invoice tenant or subscription mismatch');
END;
