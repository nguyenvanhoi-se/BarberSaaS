# GitHub and Workers Builds setup checklist

## Repository prerequisites

- [ ] Create or connect the intended GitHub repository; this workspace currently has no `.git` directory or remote.
- [ ] Push the reviewed code to `main` and use feature branches plus pull requests.
- [ ] Protect `main`: require pull requests, required status checks, no force pushes, and no merge when checks fail.

## Cloudflare Workers Builds

- [ ] Connect the repository under Workers & Pages / Workers Builds.
- [ ] Set production branch to `main`.
- [ ] Build command: `npm ci && npm run quality`.
- [ ] Deploy command: `node scripts/deploy-worker.mjs`.
- [ ] Preview command: `npx wrangler preview`.
- [ ] Set production `PLATFORM_DOMAIN` and HTTPS `CORS_ALLOWED_ORIGINS` as protected build variables.
- [ ] Store only required server secrets in Cloudflare/Workers Builds secret settings; never use Vite `VITE_*` variables for secrets.
- [ ] Keep `CUSTOM_DOMAIN_ENABLED=false` until Cloudflare for SaaS is configured and tested.
- [ ] Provision separate preview D1 and R2 resources, and configure preview-specific bindings and values. Do not use production data or secrets in preview.
- [ ] Confirm PR preview URL and run tenant-isolation smoke tests with disposable preview tenants.
- [ ] Confirm only the production branch deploys production; do not add a second GitHub Actions deploy workflow.

## Least privilege and operations

- [ ] Use Cloudflare-managed Workers Builds authentication where available; if a token is required, scope it to this account and only Worker deployment permissions required by the build.
- [ ] Keep D1 migration execution as a reviewed operator action separate from app deployment.
- [ ] Review build logs for accidental secret output and keep observability access restricted.
- [ ] Verify a failed typecheck, test, build, or dry-run prevents deploy.
