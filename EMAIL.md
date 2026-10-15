# Email provider configuration

Email is disabled until a provider adapter is implemented and configured. Current example values are:

```dotenv
EMAIL_ENABLED=false
EMAIL_PROVIDER=none
EMAIL_FROM=
EMAIL_REPLY_TO=
REMINDER_HOURS_BEFORE=24
SUBSCRIPTION_EXPIRATION_DAYS=7,3,1
```

`EMAIL_API_KEY` is reserved as a Worker-side secret for a future adapter. Never prefix provider credentials with `VITE_`, commit them, or put them in D1. Production configuration fails closed when `EMAIL_ENABLED=true` because this release ships no Resend, SendGrid, Mailgun, SES, or Cloudflare Email adapter.

Implement a provider behind `src/server/notifications/EmailProvider.ts`. It must implement configuration/health checks, `sendEmail()`, and `sendTemplate()`, use Worker-compatible `fetch` or a supported Worker SDK, avoid logging message bodies/secrets, and return only a provider message id.

Templates and subject lines are centralized in `src/server/notifications/email-templates.ts`; dynamic values are escaped. Tenant data is loaded by the notification layer, and links use the active SSL primary domain or configured platform subdomain.

Set `EMAIL_ENABLED=true`, provider name, sender, reply-to, and provider secret only after adding a real adapter. `GET /api/shop/notifications/config` and `GET /api/super-admin/notification-status` expose status without credentials. Health checks do not send email.
