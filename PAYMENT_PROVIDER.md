# Adding a payment provider

Implement `PaymentProvider` in `src/server/billing/PaymentProvider.ts` and keep provider-specific network calls in a server-only adapter. Never call a payment API from React.

## Required adapter behavior

1. Create checkout using only server-supplied amount, currency, invoice, plan, interval, and idempotency key.
2. Validate provider response shape and HTTPS checkout URL before returning it.
3. Verify payment status by provider API when a callback result is ambiguous.
4. Read the raw webhook body, verify its signature and timestamp/replay window with a Worker secret, then return a normalized `VerifiedPaymentEvent`.
5. Do not log raw webhook bodies, signatures, authorization headers, tokens, or payment credentials.
6. Refund only through the provider; never set `REFUNDED` from a browser request.
7. Map provider errors to safe application errors; keep provider request IDs and safe error codes in server logs.

The application must claim `(provider,event_id)` once, compare verified amount/currency/reference with the stored invoice/payment, then update payment, invoice, subscription, and audit log. Duplicate events must be harmless. No redirect query parameter is proof of payment.

## Enablement checklist

- Add an actual adapter and tests against official provider documentation/sandbox.
- Add provider-specific secrets only as Cloudflare Worker secrets. Do not use `VITE_*`.
- Approve and configure real BASIC/PRO/PREMIUM monthly/yearly prices and currency server-side.
- Test signature failures, replay, duplicate event, amount/currency mismatch, timeout, refund, renewal, and tenant boundaries.
- Update production config validation and deployment gate only after the adapter is complete. Until then keep `PAYMENT_ENABLED=false` and `PAYMENT_PROVIDER=none`.

No Stripe or VNPay contract is assumed or implemented in this release.
