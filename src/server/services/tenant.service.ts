import type { Context } from "hono";
import type { AppEnv, TenantContext } from "../types/app";
import { AppError } from "../utils/app-error";
import { TenantRepository } from "../repositories/tenant.repository";
import { normalizeRequestHostname, platformDomain, RESERVED_SUBDOMAINS } from "./domain-hostname";

export function requestHostname(context:Context<AppEnv>):string {
  const forwarded=context.env.APP_ENV==="development"?context.req.raw.headers.get("X-Forwarded-Host"):null;
  return normalizeRequestHostname(forwarded??context.req.raw.headers.get("Host"),context.req.raw.url,context.env.APP_ENV==="development");
}

export async function resolveTenant(context: Context<AppEnv>): Promise<TenantContext> {
  const host=requestHostname(context);
  const repository=new TenantRepository(context.env.DB);
  const customDomainTenant=host?await repository.findByDomain(host):null;
  if(customDomainTenant)return customDomainTenant;

  const platform=platformDomain(context.env.PLATFORM_DOMAIN);
  let slug:string|null=null;
  if(platform&&host.endsWith(`.${platform}`))slug=host.slice(0,-(platform.length+1));
  else if(context.env.APP_ENV==="development"&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.localhost$/u.test(host))slug=host.slice(0,-".localhost".length);
  if(slug&&!slug.includes(".")&&!RESERVED_SUBDOMAINS.has(slug)){
    const tenant=await repository.findBySlug(slug);
    if(tenant)return tenant;
  }
  throw new AppError(404,"SHOP_NOT_FOUND","Shop not found");
}

export function isPlatformHost(context: Context<AppEnv>): boolean {
  const host=requestHostname(context),platform=platformDomain(context.env.PLATFORM_DOMAIN);
  return host===platform||(context.env.APP_ENV==="development"&&host==="localhost");
}
