# Performance and availability notes

## Runtime behavior

- Worker request logs include duration and status for latency/error correlation without recording payloads or query strings.
- `/api/health` is a lightweight liveness response. `/api/health/ready` runs `SELECT 1` against D1 and reports 503 when the dependency is unavailable.
- Tenant API responses are not shared-cacheable. Public media with generated immutable R2 keys is cached for 365 days. Public gallery media by database ID is cached for one hour. Tenant-specific sitemap/robots and gallery-by-ID responses vary by `Host`; generic APIs use `no-store`.
- Listing APIs use bounded pagination in administrative routes; booking availability queries use date, tenant, and barber indexes. Keep tenant/date filters in D1.
- Rate limits protect costly authentication, upload, booking, and custom-domain operations. They are per Cloudflare location and should be observed/tuned in staging.

## Release profiling

Record frontend output sizes from `npm run build`, Worker output from `npm run check:worker`, and p50/p95 request duration/error rate from Cloudflare Workers Logs after each release. This repository has no production traffic baseline or external APM integration, so no latency or capacity target is claimed here.

Admin, super-admin, and public page modules are route-level lazy chunks behind a shared loading boundary. The client entry is 404.84 kB minified (127.84 kB gzip) in this workspace build. Keep public shop data and tenant-isolated cache keys separate if a query cache or CDN cache policy changes.
