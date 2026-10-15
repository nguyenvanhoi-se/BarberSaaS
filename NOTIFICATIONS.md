# Notifications

## Events

The notification layer supports booking created/confirmed/cancelled/completed/reminder, customer welcome, payment success/failure, subscription-expiration warning, and custom-domain verified/failed templates. Password reset has a typed template only; authentication does not currently implement password reset.

Business routes hand events to `NotificationService` through Cloudflare `ExecutionContext.waitUntil()`. Delivery is outside the booking/payment transaction, so an email problem does not roll back the business action. `NotificationQueue` is ready for a Cloudflare Queue adapter; the current direct adapter uses `waitUntil` and is not a durable queue.

## Idempotency and records

Migration `0014_notifications.sql` adds `email_logs`. `notification_key` is unique, and reminder/payment/domain notices use stable event keys. Duplicate events are not sent again. Recipient addresses are retained for delivery/audit; logs also store a SHA-256 recipient identifier. Message bodies, passwords, tokens, and provider credentials are not stored.

Statuses are `QUEUED`, `SENDING`, `SENT`, `FAILED`, and `RETRYABLE_FAILED`. The disabled provider records `FAILED / NOT_CONFIGURED`; it never reports successful delivery. A future provider adapter should classify transient failures and retry at most three times.

## Scheduled work

Wrangler runs the Worker scheduled handler hourly (`0 * * * *`). It looks for upcoming active bookings, sends reminders inside the configured reminder window, and sends subscription-expiration warnings on configured day thresholds. A separate `booking_notifications` table is not needed: unique `email_logs.notification_key` provides the idempotency record. `runNotificationSchedule(env, now)` is exported for local/test invocation. No long-running process is used.

## Shop settings

SHOP_OWNER can manage customer booking emails, owner booking alerts, reminders, and billing notices at `/admin/settings/notifications`. Settings are tenant-scoped and changes are audited. Marketing email is not implemented.

## Current delivery mode

Email delivery is `NOT_CONFIGURED`. The UI and `POST /api/shop/notifications/test-email` report that state; no vendor adapter or credentials are configured. Password-reset delivery can be used only after the authentication reset flow exists.
