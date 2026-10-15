# Production runbook

## Normal release

1. Review the pull request and required Workers Builds checks on `main`.
2. Review pending D1 migrations separately; rehearse on preview/staging and get explicit operator review.
3. Apply only reviewed migrations with `npm run db:migrate:remote`.
4. Merge to `main`; Workers Builds runs quality gates and deploys the Worker/assets.
5. Check `/api/health`, `/api/health/ready`, public shop pages, authentication, booking, owner/admin, Super Admin, managed media, subscription and domain endpoints.
6. Review Worker logs and verify tenant A/B isolation on preview before production traffic changes.

`npm run deploy` is a manual production deploy command. It runs typecheck, tests, build, and Wrangler dry-run before the actual deploy. It requires production settings and authenticated Cloudflare access. It does not migrate or seed D1.

## Failed deploy or Worker errors

**Symptoms:** build/deploy check fails, Worker returns 5xx, or health check fails.

**Check:** inspect the failed Workers Builds step and Cloudflare Workers Logs/Observability. Use request ID, route, status, duration, shop ID, and user ID where present. Never copy cookies, authorization headers, passwords, or tokens into incident notes.

**Action:** stop the rollout; do not rerun a failing deploy blindly. For a bad Worker version, use the Cloudflare dashboard's Deployments/Versions controls to roll back to the last known good Worker version, then verify health. Confirm code/schema compatibility before rollback if a D1 migration was separately applied.

## D1 errors

**Symptoms:** readiness fails or API reports database errors.

**Check:** Worker D1 binding name `DB`, database ID, Cloudflare D1 status, migration list, and relevant Worker logs. Do not print query parameters that can contain personal data.

**Action:** stop writes if integrity is uncertain. Do not reset the database or apply an unreviewed migration. Use the recovery procedure in [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md); restore only after incident-owner approval and a recorded recovery point.

## R2 errors

**Symptoms:** image upload/read/delete fails.

**Check:** `MEDIA_BUCKET` binding and bucket availability, Worker logs, and D1 metadata for the affected managed key. Do not make the bucket public as a quick fix.

**Action:** preserve D1 metadata and R2 objects while investigating. Retry idempotent operations only after verifying their effect. Restore media only from an explicitly configured account backup/export; this repository has no R2 backup automation.

## Authentication issue

**Symptoms:** session login or protected APIs fail.

**Check:** production environment configuration, cookie/security headers, D1 readiness, same-origin behavior and allowlisted CORS origins. Do not request or log a user's password or session cookie.

**Action:** stop the affected release, roll back Worker code if the issue began with deployment, and test recovery with a designated staging account. Do not create a hard-coded emergency login.

## Custom domain issue

**Symptoms:** hostname does not resolve, ownership remains pending, or SSL is not active.

**Check:** `CUSTOM_DOMAIN_ENABLED`, server-side token availability, zone ID, fallback target, Cloudflare Custom Hostnames state, DNS validation records, and Worker logs. Report only Cloudflare's actual domain and SSL states.

**Action:** keep the platform hostname available, keep a pending domain non-primary, and do not manually mark it active. Disable provisioning if credentials/configuration are incomplete. Follow DNS and SSL recovery in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Observability

Use the Cloudflare dashboard's Worker logs and Observability for `barbersaas`. Sampling is configured in `wrangler.jsonc`; the current sample rate is 10%. Confirm access controls and retention in the Cloudflare account. No external error tracking service is configured.
