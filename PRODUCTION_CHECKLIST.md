# Production release checklist

## Before release

- [ ] GitHub repository connected to Cloudflare Workers Builds; `main` protected and PR checks required.
- [ ] Production and preview use separate D1 databases, R2 buckets, variables, and secrets.
- [ ] Replace the placeholder D1 database ID and confirm the production D1 database and `MEDIA_BUCKET` bindings.
- [ ] Confirm production R2 bucket exists and remains private.
- [ ] Configure `PLATFORM_DOMAIN`, HTTPS `CORS_ALLOWED_ORIGINS`, and Cloudflare production routes/wildcard DNS.
- [ ] Keep custom-domain provisioning disabled until Custom Hostnames, fallback origin, DNS target, zone permissions, and the Worker secret `CLOUDFLARE_API_TOKEN` are configured and tested.
- [ ] Assign unique Rate Limiting namespace IDs for this Cloudflare account if `10001`–`10004` are already used by another Worker.
- [ ] Confirm the Worker has a suitable CPU/request budget, observability sampling, alerting, and access controls for logs.
- [ ] Run `npm ci` and `npm run quality` in the release environment (`typecheck`, tests, build, Worker dry-run).
- [ ] Run `npm audit` with registry access and review production and development dependency advisories.
- [ ] List pending remote D1 migrations, review/rehearse each, then apply as a separate operator step.
- [ ] Bootstrap the initial Super Admin through the guarded one-time command; do not run local demo seed against production.
- [ ] Deploy only from protected `main`; verify the deployment version and retain the prior version for rollback.
- [ ] Verify `/api/health` and `/api/health/ready`; exercise login, tenant isolation, booking conflict, upload, custom domain status, and 429 responses in staging.
- [ ] Smoke test public shop/services/barbers, login, booking, owner/admin, Super Admin, media, subscription, and domain endpoints using designated test tenants.
- [ ] Check CSP/security headers, browser CORS/Origin behavior, cookies, sitemap canonical hosts, and `robots.txt` on platform and custom domains.
- [ ] Verify migration order and application behavior against a copy/staging database before applying migrations remotely.
- [ ] Confirm logs are visible without passwords, tokens, cookies, or authorization headers; verify rollback and incident contacts.
- [ ] Confirm D1 recovery retention and R2 recovery strategy in the Cloudflare account. Do not assume repository documentation means backups are configured.

## Current workspace status

- Production D1 ID: **NOT CONFIGURED** (the Wrangler config still contains an all-zero placeholder).
- Production R2 bucket/account access: **NOT VERIFIED**.
- Cloudflare credentials, GitHub repository connection, production hostname, and hosted preview: **NOT CONFIGURED**.
- Production deployment: **NOT RUN**.

## D1 recovery

D1 Time Travel provides point-in-time recovery for supported production-backed databases. Check the database storage `version` and available retention with `npx wrangler d1 info barbersaas-db`; current Cloudflare documentation describes retention up to 30 days on Workers Paid and 7 days on Workers Free. Obtain a bookmark with `npx wrangler d1 time-travel info barbersaas-db --timestamp <RFC3339-or-unix-time>`.

Restoring with `npx wrangler d1 time-travel restore barbersaas-db --bookmark <bookmark>` overwrites the database and cancels in-flight queries. Treat this as a destructive incident operation: notify the incident lead, preserve the current bookmark, rehearse on staging where possible, and record the pre-restore bookmark so the restore can be undone. For retention beyond Time Travel, define and test a separate export-to-R2 process; this project does not currently configure one.

Official references: [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/), [Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## R2 recovery

- [ ] Confirm bucket access policy, object lifecycle/retention, and any account-level recovery/versioning capability before launch.
- [ ] R2 image objects are referenced by D1 metadata. Before restoring D1, ensure referenced R2 objects remain available; deleting metadata does not itself recover objects.
- [ ] This repository has no automated R2 backup or orphan-object cleanup job. Document the account-specific recovery/export process before storing production media.

## Rollback

- [ ] Keep the prior Worker deployment available for rollback.
- [ ] Do not roll back application code across an incompatible D1 migration without a tested forward fix or recovery plan.
- [ ] Confirm restored D1 and R2 references together, then verify tenant isolation and public media before reopening traffic.
