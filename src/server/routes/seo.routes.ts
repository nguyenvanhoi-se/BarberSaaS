import { Hono } from "hono";
import type { AppEnv } from "../types/app";
import { requireTenant } from "../middleware/tenant";
import { DomainRepository } from "../repositories/domain.repository";
import { platformDomain } from "../services/domain-hostname";

export const seoRoutes = new Hono<AppEnv>();
seoRoutes.use("/robots.txt", requireTenant);
seoRoutes.use("/sitemap.xml", requireTenant);

seoRoutes.get("/robots.txt", (context) => {
  const tenant = context.get("currentTenant");
  if (!tenant || tenant.status !== "ACTIVE") return context.text("User-agent: *\nDisallow: /\n", 404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  const sitemap = new URL("/sitemap.xml", canonicalOrigin(context.req.url, context.env.PLATFORM_DOMAIN, tenant.slug)).toString();
  return context.text(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /super-admin\nDisallow: /profile\nDisallow: /my-bookings\nDisallow: /login\nDisallow: /register\nSitemap: ${sitemap}\n`, 200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300", "Vary": "Host", "X-Robots-Tag": "noindex" });
});

seoRoutes.get("/sitemap.xml", async (context) => {
  const tenant = context.get("currentTenant");
  if (!tenant || tenant.status !== "ACTIVE") return context.body(null, 404, { "Cache-Control": "no-store" });
  const domains = await new DomainRepository(context.env.DB).list(tenant.id);
  const primary = domains.results.find((item) => item.is_primary === 1 && item.status === "ACTIVE" && item.ssl_status === "ACTIVE")?.hostname;
  const base = primary ? `https://${primary}` : canonicalOrigin(context.req.url, context.env.PLATFORM_DOMAIN, tenant.slug);
  const urls = ["/", "/services", "/barbers", "/gallery", "/about", "/contact", "/reviews"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((path) => `<url><loc>${escapeXml(new URL(path, base).toString())}</loc></url>`).join("")}</urlset>`;
  return context.body(xml, 200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300", "Vary": "Host", "X-Content-Type-Options": "nosniff" });
});

function canonicalOrigin(requestUrl: string, configuredPlatform: string | undefined, slug: string): string {
  const request = new URL(requestUrl);
  const hostname = request.hostname === "localhost" || request.hostname.endsWith(".localhost")
    ? request.host
    : configuredPlatform ? `${slug}.${platformDomain(configuredPlatform) ?? configuredPlatform}` : request.host;
  return `${request.hostname === "localhost" || request.hostname.endsWith(".localhost") ? request.protocol : "https:"}//${hostname}`;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}
