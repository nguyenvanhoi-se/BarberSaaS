# BarberSaaS

Cloudflare-first scaffold for a multi-tenant barbershop SaaS. The application uses a React + TypeScript SPA served by a Cloudflare Worker, with Hono as the Worker framework, D1 as the database binding, and R2 as the media storage binding.

## Requirements

- Node.js 20.19+ (or 22.12+) and npm
- Cloudflare account only when deploying or connecting remote resources

## Local development

```sh
npm install
npm run dev
```

Vite runs the client and Worker locally through the Cloudflare Vite plugin. D1 and R2 are bound as local development resources.

Copy `.dev.vars.example` to `.dev.vars` for local environment and CORS settings. Set `PLATFORM_DOMAIN` to the root domain used for shop subdomains (for example `mybarber.vn`); local shops resolve at `<slug>.localhost`, while registered custom domains resolve directly. Keep real secrets in local variables or Cloudflare secrets; never commit them. `.env.example` documents the optional browser-visible API origin setting. In production, configure `APP_ENV=production`, `PLATFORM_DOMAIN`, and `CORS_ALLOWED_ORIGINS` as a comma-separated list of trusted frontend origins in Wrangler/Cloudflare settings. CORS does not allow arbitrary origins.

The Hono API is mounted under `/api` and uses a shared response envelope. The foundation includes request IDs, centralized error handling, CORS and security headers. `GET /api/health` is the liveness endpoint; it does not query D1, so it reports Worker availability rather than database readiness.

## Cloudflare resources

`wrangler.jsonc` keeps the default `DB` binding on Wrangler's local D1 emulator. `npm run dev` and integration tests do not write to remote staging. The explicit `staging` environment binds `DB` to `barbersaas-staging-db` (`d32ec225-aa1b-4bf9-83a4-c3f2b87c4064`); use that environment only when intentionally testing against staging. The base/production D1 ID remains a zero placeholder, so the production deploy script fails closed until a real production database is created and verified. No R2 bucket is currently bound: public pages and booking work without it, while image uploads are explicitly unavailable and return `STORAGE_NOT_CONFIGURED`. Existing image metadata is preserved; static files under `public/images` provide fallbacks.

The D1 schema is maintained as ordered SQL migrations under `migrations/`. Validate every migration against a clean in-memory SQLite database with:

```sh
npm run db:migrations
```

Apply them to the local Wrangler database with:

```sh
npm run db:migrate
```

Booking uses D1 services, barber schedules, tenant settings, and active bookings. The public slot endpoint is `GET /api/public/booking/available-slots`; customers create bookings through `POST /api/customer/bookings` after signing in. The customer account supports listing, detail, and cancellation; shop staff can list/filter bookings and transition valid statuses. `slot_interval_minutes`, `timezone`, `opening_hours`, `booking_advance_days`, and `cancellation_window_hours` are optional shop settings. The local seed supplies two shops, services, barbers, customers, and weekly schedules for trying the flow.

The public shop website resolves its tenant from the current hostname. Seed the local demo shops with `npm run db:seed`, then browse using `demo-barber-studio.localhost` or `demo-classic-barber.localhost` while Vite is running. Public pages include `/`, `/services`, `/barbers`, `/barbers/:id`, `/gallery`, `/about`, `/contact`, and the multi-step `/book` flow.

Branding is read from `shop_settings` keys `business_name`, `logo`, `favicon`, `primary_color`, `secondary_color`, `accent_color`, `font`, `hero_title`, `hero_description`, `hero_image`, `opening_hours`, `facebook_url`, `instagram_url`, `tiktok_url`, `google_maps_url`, `phone`, `email`, and `address`. The public shop API exposes only this allowlist and safe shop fields; public services, barbers, gallery items, and approved reviews are filtered by the hostname-resolved tenant.

For local development only, seed two isolated demo shops and related users, catalog, schedules, bookings, review, settings, and subscriptions:

```sh
# PowerShell example; passwords are never stored in source control.
$env:SUPER_ADMIN_EMAIL = "admin@example.test"
$env:SUPER_ADMIN_PASSWORD = "use-a-local-password-at-least-12-chars"
$env:LOCAL_DEMO_PASSWORD = "use-another-local-password-12-chars"
npm run db:seed
```

The seed command always applies migrations and executes its SQL with Wrangler's `--local` flag; there is no remote seed mode. Passwords are stored as PBKDF2-SHA256 hashes. Seeded demo users include the two owners, barber accounts from the seed records, and the `*.example.test` customer addresses; all use the local password supplied in `LOCAL_DEMO_PASSWORD`.

Authentication uses a server-side D1 session referenced by an HttpOnly, Secure, SameSite cookie. Customer registration always attaches the current hostname tenant. The Worker resolves a tenant from an exact custom domain first, then from a single-label `<slug>.<PLATFORM_DOMAIN>` hostname. API callers never choose a tenant with `shop_id`.

## Checks and build

```sh
npm run typecheck
npm test
npm run build
npm run check:worker
npm run preview
```

`npm test` runs integration checks against a local Wrangler Worker and real local D1, then removes its isolated fixtures. It covers cross-shop reads, role boundaries, IDOR, hostname resolution, cookie sessions, public branding, public data isolation, booking schedules and validation, cancellation, status transitions, Any Barber selection, pagination, and concurrent booking attempts.

### Shop owner dashboard

Sign in as a `SHOP_OWNER` on the shop's hostname and visit `/admin`. The workspace includes tenant-scoped dashboard statistics and charts, booking management, service and barber CRUD, weekly barber hours, customers, review moderation, gallery metadata, business/branding settings, and profile/password management. Uploads are disabled until an R2 bucket is provisioned and bound; the UI reports that state, and the Worker returns `503 STORAGE_NOT_CONFIGURED` instead of claiming an upload succeeded. Existing R2 keys/URLs in D1 are not modified. Public media URLs return not found while storage is unavailable, allowing image fallbacks to display.

During `npm run dev`, test the Worker endpoint at `http://localhost:5173/api/health`. A successful response includes `{ "status": "ok", "version": "..." }` inside the shared response envelope. `/api/health` is liveness; `/api/health/ready` checks safe readiness signals without returning binding credentials.

### Platform Super Admin

Sign in to the platform host at `/super-admin/login` with a `SUPER_ADMIN` account. The global workspace is available under `/super-admin`; shop owners, barbers, and customers are rejected by both the Worker role middleware and the client route guard. Set `PLATFORM_DOMAIN` so newly created shop onboarding links use `<slug>.<PLATFORM_DOMAIN>`. New owners receive a one-time link that expires after 24 hours; D1 stores only its token hash. Shop deletion is a soft transition to `INACTIVE`, and suspending a shop blocks owner authentication and protected APIs while preserving its data. Plan pricing and limits remain unconfigured, so the dashboard reports MRR as unavailable instead of inventing values.

`npm test` also runs `tests/phase8-super-admin.test.mjs` for global role access, tenant isolation, shop creation/onboarding, duplicate slug/domain rejection, shop suspension/reactivation, subscription and audit APIs, secret redaction, and Super Admin self-protection.

### Image storage status

R2 is not currently provisioned or bound in local/staging configuration. The TypeScript binding is optional, readiness reports `media_storage: "not_configured"`, and all upload/delete operations requiring R2 fail safely with `503 STORAGE_NOT_CONFIGURED`. Static fallbacks are `public/images/image-placeholder.svg` and `public/images/barbershop-hero.svg`; no shared image data is put in browser storage. When R2 is later enabled, bind `MEDIA_BUCKET` separately in each intended Wrangler environment and create the bucket in Cloudflare first. Image bytes remain in R2 and only keys/metadata remain in D1.

The Phase 7 integration suite verifies that missing R2 does not break the Worker, uploads return `STORAGE_NOT_CONFIGURED`, and pre-existing image metadata remains unchanged. Booking draft state is held only in `sessionStorage`; confirmed bookings and all business data remain in D1.

## Production deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Cloudflare resources, production variables, migrations, Super Admin bootstrap, preview, and deployment. `npm run quality` runs typecheck, tests, build, and a Wrangler Worker dry-run. `npm run deploy` runs those gates and then performs a real Cloudflare deploy; it requires production settings and Cloudflare authentication. It does not apply migrations or seed data. Never run `npm run db:seed` against production. Remote migration review and application are separate steps; use `npm run db:migrations:list:remote` before `npm run db:migrate:remote`.

The intended hosted CI/CD strategy is Cloudflare Workers Builds: protected `main` deploys production and non-production branches create previews. Configure separate preview D1/R2 resources and variables; deployment is **not configured** in this checkout because it has no Git repository remote, production database ID, Cloudflare credentials, or verified production hostname. Do not treat local `npm run preview` as a hosted preview deployment.

Operational procedures: [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md), [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md), [GITHUB_PRODUCTION_CHECKLIST.md](./GITHUB_PRODUCTION_CHECKLIST.md), and [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md).

### Billing and payment

Billing schema, owner/Super Admin APIs, invoice views, cancellation scheduling, manual adjustment audit, reconciliation reporting, and the provider interface are documented in [BILLING.md](./BILLING.md) and [PAYMENT_PROVIDER.md](./PAYMENT_PROVIDER.md). Payment is currently **NOT CONFIGURED**: plan prices are unset, only the fail-closed `NoopProvider` exists, checkout/webhooks are disabled, and no payment is simulated.

## Project layout

```text
src/
  client/       React application, routes, UI, hooks, contexts, and client libraries
  server/       Hono Worker entrypoint and server-side modules
  shared/       Types and utilities shared across client and Worker
migrations/     D1 SQL migrations
public/         Static public files
scripts/        Project maintenance scripts
tests/          Automated tests
```

### Custom domains and tenant routing

Platform subdomains are resolved from each shop's unique `slug` using the configured `PLATFORM_DOMAIN` (for example `shop-a.mybarber.vn`). Custom hostnames are stored in `shop_domains`, which is the source of truth for domain lifecycle and mapping; the legacy `shops.domain` value is cleared by migration 0011. A custom hostname resolves to a tenant only after Cloudflare reports both hostname ownership status `active` and SSL status `active`. Pending or failed records never make a shop website resolve on that hostname. The `www` hostname is treated as a separate custom domain and must be connected and verified independently; the primary domain drives canonical SEO metadata.

For local development, use `shop-a.localhost` with `APP_ENV=development`, or use an isolated test hostname mapping in `shop_domains`. Local custom-domain records remain pending unless the real provider is configured. `POST /api/shop/domains` does not claim ownership merely because a user typed a hostname.

Custom domain onboarding is at `/admin/settings/domains`. The owner connects a hostname, configures the DNS and ownership validation records shown in the dashboard, then uses **Check status** after DNS propagates. Domain ownership and SSL certificate provisioning are separate states; the domain can become primary only when both are active. The Worker uses the Cloudflare for SaaS Custom Hostnames API on the server side. Customers never provide API tokens. Apex/root domains may require Cloudflare's SaaS apex proxying; the exact CNAME/validation records returned by the configured provider are shown to the owner. Removing an active provider hostname requires Cloudflare API access first so a failed provider cleanup does not silently free the database mapping.

Set these non-secret Worker variables only after configuring Cloudflare for SaaS and its fallback/origin target:

```text
CUSTOM_DOMAIN_PROVIDER=cloudflare
CUSTOM_DOMAIN_ENABLED=false
CUSTOM_DOMAIN_CNAME_TARGET=<configured Cloudflare for SaaS target>
CLOUDFLARE_ZONE_ID=<zone id that owns the SaaS custom hostnames>
```

Keep `CUSTOM_DOMAIN_ENABLED=false` until zone, SaaS fallback origin, DNS target, and API token permissions are ready. Then set `CUSTOM_DOMAIN_ENABLED=true` in the deployment environment and store the token as a Worker secret (`npx wrangler secret put CLOUDFLARE_API_TOKEN`). The token needs only the Cloudflare permissions required to create, read, update, and delete custom hostnames for the selected zone. Never place it in Vite variables, `.dev.vars.example`, or D1. For local provider testing, put the real token in your untracked `.dev.vars`; this project does not provide fake Cloudflare success responses.

The custom hostname is created through `POST /zones/{zone_id}/custom_hostnames` using the selected `http`, `txt`, or `email` ownership validation method. DNS should point the hostname at the configured Cloudflare for SaaS target and publish the validation record returned by Cloudflare. Cloudflare then validates ownership and provisions SSL independently; a DNS record alone does not mark the domain active. Provider outages and invalid credentials return safe application errors without exposing API responses or credentials.

Subdomain routing needs a wildcard DNS record and Worker route for `*.mybarber.vn` (plus the platform root for Super Admin). Custom domains need Cloudflare for SaaS Custom Hostnames enabled on the account/zone and a correctly configured fallback origin. Deployment does not create these account-level settings. All production deployments need `PLATFORM_DOMAIN`; custom-domain provisioning additionally requires `CUSTOM_DOMAIN_CNAME_TARGET`, `CLOUDFLARE_ZONE_ID`, `CUSTOM_DOMAIN_PROVIDER=cloudflare`, `CUSTOM_DOMAIN_ENABLED=true`, and the server-only `CLOUDFLARE_API_TOKEN` secret. Keep provisioning disabled until all provider configuration is ready.

## Production operations

Phase 12 security, performance, and release notes are in [PRODUCTION_AUDIT.md](./PRODUCTION_AUDIT.md), [SECURITY.md](./SECURITY.md), [PERFORMANCE.md](./PERFORMANCE.md), and [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md). The Worker provides `/api/health` for liveness and `/api/health/ready` for a D1 readiness check. It also serves tenant-specific `/robots.txt` and `/sitemap.xml` using the active primary domain.

Wrangler configures Cloudflare edge limits for auth (30/min), booking (12/min), custom domain requests (10/min), and uploads (20/min). The configured namespace IDs (`10001`–`10004`) must be unique within your Cloudflare account. Cloudflare enforces these limits at edge locations after deployment; local Wrangler is not a reliable rate-limit test environment. Production also requires valid `PLATFORM_DOMAIN` and explicit HTTPS `CORS_ALLOWED_ORIGINS`; custom-domain credentials are required only when provisioning is enabled.

For local checks, run `npm run typecheck`, `npm run build`, `npm run check:worker`, and `npm test`. Do not use `npm run deploy` as a validation command; it publishes the Worker.

## Notifications and email

Transactional notification events, tenant notification settings, the scheduled reminder handler, and the provider abstraction are documented in [NOTIFICATIONS.md](./NOTIFICATIONS.md) and [EMAIL.md](./EMAIL.md). Email is disabled and no provider adapter is configured; events do not claim delivery, and delivery failures do not fail booking actions.
