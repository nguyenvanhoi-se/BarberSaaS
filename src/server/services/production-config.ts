import type { Bindings } from "../types/bindings";
import { normalizeHostname } from "./domain-hostname";

/** Returns a safe configuration error code; never returns a secret or raw value. */
export function productionConfiguration(environment: Bindings): boolean {
  if (environment.APP_ENV !== "production") return false;
  if (!environment.PLATFORM_DOMAIN || !normalizeSafely(environment.PLATFORM_DOMAIN)) return true;
  const origins = (environment.CORS_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!origins.length || origins.some((origin) => !isTrustedProductionOrigin(origin))) return true;
  if (environment.CUSTOM_DOMAIN_ENABLED?.toLowerCase() === "true" &&
      (environment.CUSTOM_DOMAIN_PROVIDER?.toLowerCase() !== "cloudflare" ||
       !environment.CLOUDFLARE_API_TOKEN || !environment.CLOUDFLARE_ZONE_ID ||
       !environment.CUSTOM_DOMAIN_CNAME_TARGET || !normalizeSafely(environment.CUSTOM_DOMAIN_CNAME_TARGET))) return true;
  // No signed payment provider adapter is shipped yet; enabling it must fail closed.
  if (environment.PAYMENT_ENABLED?.toLowerCase() === "true") return true;
  // No email provider adapter is shipped yet; never advertise delivery without one.
  if (environment.EMAIL_ENABLED?.toLowerCase() === "true") return true;
  return false;
}

function normalizeSafely(hostname: string): string | null {
  try { return normalizeHostname(hostname); } catch { return null; }
}

function isTrustedProductionOrigin(value: string): boolean {
  try {
    const origin = new URL(value);
    return origin.protocol === "https:" && origin.origin === value && origin.username === "" && origin.password === "";
  } catch { return false; }
}
