# Release Blockers

Review date: 2026-10-15 (release blocker remediation)  
Release status: **NOT READY**

These are remaining CRITICAL/HIGH items only. Phase 16 fixed the nested shop route role-policy gap and added the missing own-booking review flow; those fixed issues are recorded in `PRODUCTION_AUDIT.md` and are not listed as open blockers.

## HIGH

1. **Production database and Cloudflare account are not configured.** `wrangler.jsonc` still has the zero UUID; `npx wrangler whoami` reports not authenticated. Production D1/R2/secrets/routes/domain and remote migration state are unverified; no deploy was attempted.
   - **Files:** `wrangler.jsonc` intentionally unchanged; no ID was invented.
   - **Mitigation:** leave production deployment blocked; no remote commands that mutate data were run.
   - **Verification:** `npx wrangler whoami` → unauthenticated; inspected D1 binding → placeholder.
   - **Manual:** run `npx wrangler login`, verify `npx wrangler whoami`, inspect `npx wrangler d1 list`, and reuse the intended DB or create one with `npx wrangler d1 create barbersaas-production --binding DB`; use only the returned UUID in config. Verify R2 separately. Before remote migrations, securely export outside the repo using `npx wrangler d1 export <CONFIRMED_DATABASE> --remote --output=<SECURE_BACKUP_PATH>`, run `npx wrangler d1 migrations list <CONFIRMED_DATABASE> --remote`, review pending migrations/recovery, and only then run `npx wrangler d1 migrations apply <CONFIRMED_DATABASE> --remote`.
2. **Runtime security and E2E acceptance are blocked by loopback socket restrictions.** `wrangler d1 migrations apply ... --local` returns `fetch failed`; `wrangler dev --inspector-port 9231` returns `connect EACCES 127.0.0.1:9231`. Node bind works and port is unoccupied, but same-process loopback HTTP fetch returns `EACCES`. `.wrangler` write access passes. Root cause is execution-environment loopback networking, not SQL or file permissions.
   - **Files:** `scripts/run-tests.mjs`, `tests/migrations.test.mjs`, `tests/wrangler-test-utils.mjs`, `package.json`, and Phase 4/6/7/8/10/12/14 test launchers.
   - **Mitigation:** migration validation runs first; all suites run independently; local persistence is isolated under `.wrangler/test-state/<run>/<suite>`; telemetry is disabled; PASS/FAIL/BLOCKED are distinct and BLOCKED keeps `npm test` nonzero. No assertions were removed.
   - **Verification:** `npm run db:migrations:check` PASS on clean SQLite. `npm test` summary: PASS=4, FAIL=0, BLOCKED=7. Wrangler integration suites are not counted as pass.
   - **Manual:** run `npm test` from a Windows/CI runner where Wrangler can connect to local loopback; then perform the two-tenant role/IDOR and booking concurrency flows.
3. **Paid self-service billing is unavailable.** Payment is `NOT_CONFIGURED`; no production provider adapter/credentials or verified signed webhook path exists.
   - **Files:** none; no payment was faked or enabled.
   - **Verification:** billing integration suite is BLOCKED by Wrangler; no live payment was tested.
   - **Manual:** implement/select a real provider, configure server-only credentials, and verify checkout, signature validation, idempotency and activation in isolated preview before selling paid subscriptions.

## CRITICAL

None identified by the source/config review and tests that could run. This is not a claim that production runtime is secure: the HIGH verification blockers above prevent full acceptance.

## Resolution required

- Configure isolated Cloudflare preview and production resources, replacing the D1 placeholder only with the intended verified database ID.
- Run every integration test in an environment that permits Wrangler loopback connections, and perform the specified customer, owner, super-admin, cross-tenant, booking concurrency, R2, domain, billing, and notification checks.
- Configure and verify the production payment provider if paid customer onboarding is in scope.
- This workspace has no `.git`; `.gitignore` excludes `.env`, `.dev.vars`, `.wrangler`, build output, and dependencies. No commit was made. Create a protected backup/version-control baseline before substantial future edits.
- Close the checklist in `PRODUCTION_READINESS.md` before changing release status.
