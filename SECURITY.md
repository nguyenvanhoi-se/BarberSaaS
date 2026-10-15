# Security operations

## Authentication and tenant boundaries

- Session credentials are opaque, stored hashed in D1, and delivered via `HttpOnly; Secure; SameSite=Lax` cookies. Keep secrets in Cloudflare Worker secrets or untracked `.dev.vars`; never use `VITE_*` for credentials.
- Browser API requests must be same-origin or use an explicitly trusted `CORS_ALLOWED_ORIGINS` HTTPS origin in production. The Worker rejects untrusted `Origin` values before route execution.
- Tenant identity comes from the request hostname. Never accept a client `shop_id` or `tenant_id` as the authorization scope.
- Add authorization and tenant-scoped repository queries to every new private route. Treat object IDs from clients as untrusted and return not found for resources outside the caller's scope.
- Private/authenticated APIs use `Cache-Control: private, no-store`. Only immutable public media is cacheable for a year.

## Rate limiting and abuse response

Cloudflare Worker Rate Limiting bindings protect auth (30/min), booking (12/min), domain provisioning/checks (10/min), and uploads (20/min). The key includes the action family and Cloudflare client IP. Limits apply per Cloudflare location and are not a globally consistent billing quota. Local Wrangler does not enforce the deployed limits. Review Workers Logs for repeated 429s and adjust thresholds without disabling tenant authorization or input validation.

## Secrets and logs

- Set provider credentials with `npx wrangler secret put CLOUDFLARE_API_TOKEN`; keep the D1/R2 bindings in Wrangler, not frontend env.
- Never log request bodies, cookies, authorization headers, full provider responses, passwords, tokens, or secret values. Application errors log request ID, event, and error class only.
- Workers Logs are enabled with 10% head sampling in Wrangler. Change sampling for incident response only after considering volume and data handling requirements.

## Incident triage

1. Use `X-Request-Id` from the affected response to locate the matching structured Worker log.
2. Check Worker error and rate-limit metrics, D1 health, R2 availability, and Cloudflare domain status.
3. Suspend a compromised user/shop through the existing administrative controls. Rotate leaked credentials in Cloudflare, invalidate relevant sessions, and review audit logs.
4. Preserve timestamps and request IDs. Do not copy session cookies, tokens, or customer personal data into tickets.
5. If database integrity is affected, follow `PRODUCTION_CHECKLIST.md` and rehearse point-in-time recovery on a non-production database before restoring production.
