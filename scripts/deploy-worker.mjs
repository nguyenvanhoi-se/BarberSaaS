import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const wranglerConfig = JSON.parse(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

const productionDatabase = wranglerConfig.d1_databases?.find((database) => database.binding === "DB");
if (!productionDatabase?.database_id || productionDatabase.database_id === "00000000-0000-0000-0000-000000000000") {
  fail("Production deployment is blocked until a real production D1 database is created and configured for the DB binding.");
}

const platformDomain = process.env.PLATFORM_DOMAIN?.trim().toLowerCase();
const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
if (!platformDomain || platformDomain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(platformDomain)) {
  fail("Missing required production configuration: set PLATFORM_DOMAIN to the production platform hostname.");
}
if (!corsOrigins.length || corsOrigins.some((value) => {
  try { const parsed = new URL(value); return parsed.protocol !== "https:" || parsed.origin !== value; }
  catch { return true; }
})) {
  fail("Missing required production configuration: set CORS_ALLOWED_ORIGINS to comma-separated HTTPS origins.");
}

const customDomainEnabled = process.env.CUSTOM_DOMAIN_ENABLED?.toLowerCase() === "true";
const customDomainProvider = process.env.CUSTOM_DOMAIN_PROVIDER?.trim().toLowerCase() || "cloudflare";
const customDomainTarget = process.env.CUSTOM_DOMAIN_CNAME_TARGET?.trim().toLowerCase();
const cloudflareZoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
if (customDomainEnabled && (customDomainProvider !== "cloudflare" || !customDomainTarget || !cloudflareZoneId)) {
  fail("Missing required production configuration for custom domains. Keep CUSTOM_DOMAIN_ENABLED=false until the Cloudflare zone and target are configured.");
}

const paymentEnabled = process.env.PAYMENT_ENABLED?.toLowerCase() === "true";
const paymentProvider = process.env.PAYMENT_PROVIDER?.trim().toLowerCase() || "none";
const paymentCurrency = process.env.PAYMENT_CURRENCY?.trim().toUpperCase() || "VND";
if (paymentEnabled || paymentProvider !== "none") {
  fail("Payment is not configured in this release. Keep PAYMENT_ENABLED=false and PAYMENT_PROVIDER=none.");
}
if (!/^[A-Z]{3}$/u.test(paymentCurrency)) fail("PAYMENT_CURRENCY must be a three-letter uppercase currency code.");

const emailEnabled = process.env.EMAIL_ENABLED?.toLowerCase() === "true";
const emailProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "none";
if (emailEnabled || emailProvider !== "none") {
  fail("Email delivery is not configured in this release. Keep EMAIL_ENABLED=false and EMAIL_PROVIDER=none.");
}

const appVersion = (process.env.APP_VERSION || process.env.GITHUB_SHA || packageJson.version).trim();
if (!/^[A-Za-z0-9._-]{1,128}$/u.test(appVersion)) fail("APP_VERSION must contain only letters, numbers, dots, underscores, and hyphens.");

const args = [wrangler, "deploy", "--var", "APP_ENV:production", "--var", `APP_VERSION:${appVersion}`, "--var", `PLATFORM_DOMAIN:${platformDomain}`, "--var", `CORS_ALLOWED_ORIGINS:${corsOrigins.join(",")}`, "--var", `CUSTOM_DOMAIN_ENABLED:${customDomainEnabled ? "true" : "false"}`, "--var", "PAYMENT_ENABLED:false", "--var", "PAYMENT_PROVIDER:none", "--var", `PAYMENT_CURRENCY:${paymentCurrency}`, "--var", "EMAIL_ENABLED:false", "--var", "EMAIL_PROVIDER:none"];
if (customDomainEnabled) {
  args.push("--var", `CUSTOM_DOMAIN_PROVIDER:${customDomainProvider}`, "--var", `CUSTOM_DOMAIN_CNAME_TARGET:${customDomainTarget}`, "--var", `CLOUDFLARE_ZONE_ID:${cloudflareZoneId}`);
}

const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: { ...process.env, XDG_CONFIG_HOME: resolve(root, ".wrangler/config") } });
if (result.error) fail("Wrangler could not start. Review the local Wrangler installation and Cloudflare authentication.");
if (result.status !== 0) process.exit(result.status ?? 1);
