import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/app";
import { resolveTenant } from "../services/tenant.service";
import { AppError } from "../utils/app-error";

export const requireTenant = createMiddleware<AppEnv>(async (context, next) => {
  const tenant = await resolveTenant(context);
  context.set("currentTenant", tenant);
  context.set("currentTenantId", tenant.id);
  await next();
});

export const requireActiveTenant = createMiddleware<AppEnv>(async (context, next) => {
  const tenant = context.get("currentTenant");
  if (!tenant) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  if (tenant.status !== "ACTIVE") throw new AppError(403, "SHOP_UNAVAILABLE", "This shop is not currently available");
  await next();
});

export const resolveTenantIfPresent = createMiddleware<AppEnv>(async (context, next) => {
  try {
    const tenant = await resolveTenant(context);
    context.set("currentTenant", tenant);
    context.set("currentTenantId", tenant.id);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "SHOP_NOT_FOUND") throw error;
    // The platform host has no tenant; auth middleware restricts it to SUPER_ADMIN.
  }
  await next();
});
