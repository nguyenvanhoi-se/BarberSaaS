# Cloudflare deployment

This repository deploys one React SPA and Hono Worker together using the Cloudflare Vite plugin and Wrangler Static Assets. D1 is bound as `DB`; R2 is bound as `MEDIA_BUCKET`. Images are served through Worker routes. There is no VPS, Workers Sites deployment, database reset, production seed, or migration in the deploy command.

## 1. Prepare Cloudflare resources

Install Node.js 20.19+ and npm, then authenticate:

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

Inspect your account before creating anything:

```sh
npx wrangler d1 list
npx wrangler r2 bucket list
```

If `barbersaas-db` does not exist, create it with `npx wrangler d1 create barbersaas-db`, then replace the all-zero `database_id` in `wrangler.jsonc` with the returned ID. If `barbersaas-media` does not exist, create it with `npx wrangler r2 bucket create barbersaas-media`. Do not create duplicates or point preview at production resources. The repository does not contain a production database ID or verify that either named resource exists.

Configure the production Worker name `barbersaas`, platform hostname, wildcard DNS/Worker routing, and the account's rate limit namespaces. The R2 bucket should remain private; the application serves managed images through its Worker media endpoint.

## 2. Environment configuration and secrets

`npm run deploy` requires these process environment values and validates them without printing secrets:

```text
PLATFORM_DOMAIN=mybarber.vn
CORS_ALLOWED_ORIGINS=https://mybarber.vn,https://www.mybarber.vn
```

The deploy script supplies production `APP_ENV`, build version, platform domain, CORS allowlist, and `CUSTOM_DOMAIN_ENABLED=false` as Worker variables. To deploy from PowerShell, set them for that shell session first:

```powershell
$env:PLATFORM_DOMAIN = "mybarber.vn"
$env:CORS_ALLOWED_ORIGINS = "https://mybarber.vn,https://www.mybarber.vn"
npm run deploy
```

The only currently required production secret is `CLOUDFLARE_API_TOKEN` when Custom Hostnames provisioning is deliberately enabled. Create a least-privilege token for the selected zone with the Custom Hostnames permissions needed by the application, then set it with `npx wrangler secret put CLOUDFLARE_API_TOKEN`. Do not put secrets in Vite variables, `wrangler.jsonc`, Git, D1, or this documentation. Custom domains stay disabled unless `CUSTOM_DOMAIN_ENABLED=true` and the provider, zone ID, and CNAME target are configured. Cloudflare for SaaS zone/fallback-origin setup is an account-level prerequisite; deployment does not create it.

## 3. Review and apply D1 migrations

Run quality checks and review the migration history before production changes:

```sh
npm run typecheck
npm test
npm run build
npx wrangler d1 migrations list barbersaas-db --remote
```

Read every pending SQL migration and rehearse it against an isolated staging D1 database. Apply reviewed migrations as a separate operator action:

```sh
npm run db:migrations:list:remote
npm run db:migrate:remote
```

`npm run deploy` never applies migrations. It never runs the seed. `npm run db:seed` is local-only and must not be run against production.

## 4. Initial Super Admin

After the schema is migrated, bootstrap the first global admin from a secure operator shell. Supply credentials through that shell's environment or secret manager; do not put them in a command line, source, or ticket. The script refuses to run if an active Super Admin or matching email exists, uses a guarded remote insert, and removes its temporary SQL file.

PowerShell example (enter values through your approved secret manager; do not save them in shell history):

```powershell
$env:SUPER_ADMIN_NAME = Read-Host "Administrator name"
$env:SUPER_ADMIN_EMAIL = Read-Host "Administrator email"
$securePassword = Read-Host "One-time password (12+ characters)" -AsSecureString
$env:SUPER_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
npm run db:bootstrap:super-admin
Remove-Item Env:SUPER_ADMIN_NAME, Env:SUPER_ADMIN_EMAIL, Env:SUPER_ADMIN_PASSWORD
Remove-Variable securePassword
```

The command requires authenticated Wrangler access and a correctly configured remote `barbersaas-db`. It does not expose the password or hash in its success output. Use the normal password change flow after first sign-in.

## 5. Preview and production

For local production-like runtime testing, use the Cloudflare Vite plugin preview after a build:

```sh
npm run build
npm run preview
```

This is local preview, not a hosted PR deployment. For hosted preview and production CI/CD, connect the repository to **Cloudflare Workers Builds** when the GitHub repository exists. Configure production branch `main`, build command `npm ci && npm run quality`, deploy command `node scripts/deploy-worker.mjs`, and preview command `npx wrangler preview`. Configure the required production values as protected build variables and secrets in Cloudflare. Give preview its own D1 database, R2 bucket, and variables; Wrangler environment bindings do not inherit automatically. Keep Custom Domains disabled for preview unless a separate preview zone and credentials are intentionally provisioned.

Workers Builds production deploys only the configured production branch; non-production branches produce previews. Do not also add a GitHub Actions production deploy workflow. Workers Builds/GitHub are not connected by this checkout: it currently has no `.git` metadata or remote, and no hosted preview URL has been configured.

## 6. Verify release

After deploying, check:

```text
GET https://<production-host>/api/health
GET https://<production-host>/api/health/ready
GET https://<production-host>/api/public/shop
```

`/api/health` is liveness and includes a safe version string. `/api/health/ready` checks production configuration, D1 query readiness, and presence of the R2 binding without exposing credentials. Then run the operator smoke-test checklist in [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md). Use only purpose-built staging tenants for write flows; do not create demo production data.

See [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) for operations and rollback, and [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) for recovery limitations.
