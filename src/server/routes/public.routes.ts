import { Hono } from "hono";
import type { AppEnv } from "../types/app";
import { requireTenant } from "../middleware/tenant";
import { ShopRepository } from "../repositories/shop.repository";
import { BookingRepository } from "../repositories/booking.repository";
import { availableBookingSlots } from "../services/booking.service";
import { availableSlotsQuerySchema } from "../validators/booking";
import { AppError } from "../utils/app-error";
import { successResponse } from "../utils/http-response";
import { requireActiveTenant } from "../middleware/tenant";
import { StorageService } from "../services/storage.service";
import { DomainRepository } from "../repositories/domain.repository";
import { platformDomain } from "../services/domain-hostname";

export const publicRoutes = new Hono<AppEnv>();
publicRoutes.use("*", requireTenant);

publicRoutes.get("/shop", async (context) => {
  const tenant = context.get("currentTenant");
  if (!tenant) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  const shop = await new ShopRepository(context.env.DB).shop(tenant.id);
  if (!shop) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  const primary=await new DomainRepository(context.env.DB).primary(tenant.id);
  const base=platformDomain(context.env.PLATFORM_DOMAIN);
  return successResponse(context,{...shop,canonical_domain:primary?.hostname??(base?`${tenant.slug}.${base}`:null)});
});

publicRoutes.use("/services", requireActiveTenant);
publicRoutes.use("/barbers", requireActiveTenant);
publicRoutes.use("/barbers/*", requireActiveTenant);
publicRoutes.use("/gallery", requireActiveTenant);
publicRoutes.use("/gallery/*", requireActiveTenant);
publicRoutes.use("/reviews", requireActiveTenant);
publicRoutes.use("/booking/*", requireActiveTenant);

publicRoutes.get("/booking/available-slots", async (context) => {
  const tenant = context.get("currentTenant");
  if (!tenant) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  const parsed = availableSlotsQuerySchema.safeParse(context.req.query());
  if (!parsed.success) throw new AppError(422, "VALIDATION_ERROR", "Invalid slot query", parsed.error.issues.map((issue) => ({ code: "INVALID_VALUE", message: issue.message, field: issue.path.join(".") })));
  const data = await availableBookingSlots(new BookingRepository(context.env.DB), tenant.id, parsed.data);
  return successResponse(context, data);
});

for (const resource of ["services", "barbers", "gallery", "reviews"] as const) {
  publicRoutes.get(`/${resource}`, async (context) => {
    const tenant = context.get("currentTenant");
    if (!tenant) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
    const results = await new ShopRepository(context.env.DB).publicList(tenant.id, resource);
    return successResponse(context, results);
  });
}

publicRoutes.get("/barbers/:id", async (context) => {
  const tenant = context.get("currentTenant");
  if (!tenant) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  const barber = await new ShopRepository(context.env.DB).publicBarberById(tenant.id, context.req.param("id"));
  if (!barber) throw new AppError(404, "NOT_FOUND", "Barber not found");
  return successResponse(context, barber);
});

publicRoutes.get("/gallery/:id/image", async (context) => {
  const tenant=context.get("currentTenant");if(!tenant)throw new AppError(404,"SHOP_NOT_FOUND","Shop not found");
  const item=await context.env.DB.prepare("SELECT r2_key FROM gallery WHERE shop_id=? AND id=?").bind(tenant.id,context.req.param("id")).first<{r2_key:string|null}>();
  if(!item?.r2_key)throw new AppError(404,"NOT_FOUND","Image not found");
  const object=await new StorageService(context.env.MEDIA_BUCKET).get(item.r2_key);if(!object)throw new AppError(404,"NOT_FOUND","Image not found");
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set("Cache-Control","public, max-age=3600");headers.set("Vary","Host");headers.set("X-Content-Type-Options","nosniff");headers.set("Cross-Origin-Resource-Policy","same-origin");headers.set("Content-Security-Policy","default-src 'none'; sandbox");
  return new Response(object.body,{headers});
});
