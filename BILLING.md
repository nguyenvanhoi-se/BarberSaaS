# BarberSaaS billing model

## Current release status

`PAYMENT_ENABLED=false`, `PAYMENT_PROVIDER=none`, and server currency defaults to `VND`. BASIC, PRO, and PREMIUM pricing remains `null` in `src/server/services/plan-catalog.ts`, pending a business-approved price list. As a result, checkout returns `503 PAYMENT_NOT_CONFIGURED`; no invoice/payment row is generated and no successful payment is simulated. Deployment refuses to enable payments or select an unsupported provider.

## Data model

Migration `0013_billing_payments_invoices.sql` adds tenant-scoped invoices and payments, a webhook receipt table that stores hashes/status only (no raw payload), uniqueness for invoice numbers/provider transaction IDs/idempotency keys, and one in-flight payment per invoice. Invoices snapshot plan, interval, amount, currency, and business details as JSON. Foreign keys and a database trigger prevent payment/invoice/subscription cross-tenant associations.

## Checkout and verification

The owner API accepts only `plan` and `billing_interval`, with an `Idempotency-Key` header. The Worker resolves shop from the host/session, gets server-owned plan pricing and currency, and creates provider checkout only through `PaymentProvider`. The catalog currently has no prices and the only shipped adapter is `NoopProvider`; it always fails closed. Frontend return URLs never activate a subscription. Payment result pages query the tenant-scoped payment endpoint.

`POST /api/webhooks/payment/:provider` is unauthenticated by customer session, but is not enabled until a provider adapter can verify signatures and normalize verified events. It returns a safe 503 now. The webhook table supports provider/event deduplication; there is no unsigned fallback. Payment activation must atomically confirm a matching payment, invoice amount/currency, tenant, subscription, and provider event before changing the subscription.

## Subscription changes

- Upgrades require a provider-backed paid checkout and are unavailable while payment is not configured.
- Downgrades can be scheduled for the current period end; records and resources are retained.
- Cancellation is scheduled at period end, does not remove access during the paid period, and is audited.
- Automatic renewal and scheduled change application are not configured. No cron or auto-charge is performed.
- Expiry follows Phase 10 behavior: paid features are restricted while shop data remains.

## Invoices and payment history

Shop owners can query their own `/api/shop/billing/payments*` and `/api/shop/billing/invoices*`; Super Admin has paginated global views. Invoice details are tenant-scoped and print-friendly. There is no PDF file or fake download link. Tax is not configured and new invoice records are not created until checkout is enabled.

Super Admin may manually confirm a pending payment using `POST /api/super-admin/payments/:id/manual-confirm` with a reason. The operation checks pending payment/open invoice/amount/currency/subscription state, commits changes in a D1 batch, and writes `MANUAL_PAYMENT_ADJUSTMENT` with the reason. This is an explicit privileged adjustment, not provider verification; restrict it to independently verified offline payments.

`GET /api/super-admin/billing/reconciliation` reports mismatches without changing data.
