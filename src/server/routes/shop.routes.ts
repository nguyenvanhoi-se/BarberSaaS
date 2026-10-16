import { Hono } from "hono";
import type { AppEnv } from "../types/app";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { ShopRepository } from "../repositories/shop.repository";
import { BookingRepository } from "../repositories/booking.repository";
import { changeBookingStatus } from "../services/booking.service";
import { shopBookingFilterSchema, updateBookingStatusSchema } from "../validators/booking";
import { AppError } from "../utils/app-error";
import { successResponse } from "../utils/http-response";
import { z } from "zod";
import { AdminRepository } from "../repositories/admin.repository";
import { hashPassword, verifyPassword } from "../utils/crypto";
import { shopMediaRoutes } from "./shop-media.routes";
import { StorageService } from "../services/storage.service";
import { PlanService } from "../services/plan.service";
import { requireFeature } from "../middleware/feature";
import { PLAN_CATALOG } from "../services/plan-catalog";
import { domainRoutes } from "./domain.routes";
import { logServerError } from "../utils/server-log";
import { shopBillingRoutes } from "./shop-billing.routes";
import { shopNotificationRoutes } from "./shop-notifications.routes";
import { NotificationService } from "../notifications/NotificationService";
import { shopRouteAuthorization } from "../middleware/shop-route-authorization";

export const shopRoutes = new Hono<AppEnv>();
shopRoutes.use("*", requireTenant, requireAuth, shopRouteAuthorization);
shopRoutes.use("/services", requireRole("SHOP_OWNER"));
shopRoutes.use("/barbers", requireRole("SHOP_OWNER"));
shopRoutes.use("/bookings", requireRole("SHOP_OWNER", "BARBER"));
shopRoutes.use("/customers", requireRole("SHOP_OWNER"));
shopRoutes.use("/reviews", requireRole("SHOP_OWNER"));
shopRoutes.use("/gallery", requireRole("SHOP_OWNER"));
shopRoutes.use("/settings", requireRole("SHOP_OWNER"));
shopRoutes.use("/dashboard", requireRole("SHOP_OWNER"));
shopRoutes.use("/profile", requireRole("SHOP_OWNER"));
shopRoutes.use("/change-password", requireRole("SHOP_OWNER"));
shopRoutes.use("/subscription", requireRole("SHOP_OWNER"));
shopRoutes.use("/usage", requireRole("SHOP_OWNER"));
shopRoutes.use("/domains", requireRole("SHOP_OWNER"));
shopRoutes.use("/notifications", requireRole("SHOP_OWNER"));
shopRoutes.route("/media",shopMediaRoutes);
shopRoutes.route("/domains",domainRoutes);
shopRoutes.route("/billing",shopBillingRoutes);
shopRoutes.route("/notifications",shopNotificationRoutes);

shopRoutes.get("/services", async (context) => {
  const tenant = context.get("currentTenant");
  if (!tenant) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  return successResponse(context, await new ShopRepository(context.env.DB).shopList(tenant.id, "services"));
});
const serviceSchema = z.object({ name:z.string().trim().min(1).max(120), description:z.string().max(2000).nullable().optional(), price:z.number().int().min(0), duration_minutes:z.number().int().min(1).max(600), status:z.enum(["ACTIVE","INACTIVE"]).default("ACTIVE") }).strict();
const barberSchema = z.object({ name:z.string().trim().min(1).max(120), phone:z.string().max(40).nullable().optional(), email:z.string().email().nullable().optional(), bio:z.string().max(2000).nullable().optional(), experience_years:z.number().int().min(0).max(100).default(0), specialties:z.array(z.string().trim().min(1).max(60)).max(20).default([]), status:z.enum(["ACTIVE","INACTIVE"]).default("ACTIVE") }).strict();
const idParam=z.string().trim().min(1).max(200);
function parsed<T>(schema:z.ZodType<T>,value:unknown) { const result=schema.safeParse(value); if(!result.success) throw new AppError(422,"VALIDATION_ERROR","Request data is invalid",result.error.issues.map((issue)=>({code:"INVALID_VALUE",message:issue.message,field:issue.path.join(".")}))); return result.data; }
function adminContext(context: import("hono").Context<AppEnv>) { const tenant=context.get("currentTenant"); const user=context.get("currentUser"); if(!tenant||!user) throw new AppError(401,"UNAUTHENTICATED","Authentication required"); return {tenant,user,repo:new AdminRepository(context.env.DB)}; }
const listQuerySchema=z.object({page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(50).default(20),search:z.string().trim().max(100).optional()});
function listQuery(context:import("hono").Context<AppEnv>){return parsed(listQuerySchema,context.req.query());}
shopRoutes.get("/subscription",async(c)=>{const {tenant}=adminContext(c);return successResponse(c,await new PlanService(c.env.DB).getBilling(tenant.id));});
shopRoutes.get("/usage",async(c)=>{const {tenant}=adminContext(c);const service=new PlanService(c.env.DB);const [subscription,usage]=await Promise.all([service.getBilling(tenant.id),service.getUsage(tenant.id)]);return successResponse(c,{plan:subscription.effective_plan,assigned_plan:subscription.assigned_plan,status:subscription.status,expires_at:subscription.expired_at,trial_expires_at:subscription.trial_expired_at,usage});});
shopRoutes.get("/dashboard",async(c)=>{const {tenant,repo}=adminContext(c);const range=Number(c.req.query("range")??7);if(![7,30,90].includes(range))throw new AppError(422,"VALIDATION_ERROR","Range must be 7, 30, or 90 days");const service=new PlanService(c.env.DB);const [data,plan,subscription]=await Promise.all([repo.dashboard(tenant.id,range as 7|30|90),service.getCurrentPlan(tenant.id),service.getCurrentSubscription(tenant.id)]);return successResponse(c,{...data,plan:{code:plan,name:PLAN_CATALOG[plan].name,status:subscription?.status??"EXPIRED",expired_at:subscription?.expired_at??null,trial_expired_at:subscription?.trial_expired_at??null,features:PLAN_CATALOG[plan].features},...(!PLAN_CATALOG[plan].features.advanced_statistics?{charts:undefined,popularServices:undefined,popularBarbers:undefined}:{})});});
shopRoutes.get("/advanced-statistics",requireFeature("advanced_statistics"),async(c)=>{const {tenant,repo}=adminContext(c);const range=Number(c.req.query("range")??30);if(![7,30,90].includes(range))throw new AppError(422,"VALIDATION_ERROR","Range must be 7, 30, or 90 days");const data=await repo.dashboard(tenant.id,range as 7|30|90);return successResponse(c,{charts:data.charts,popularServices:data.popularServices,popularBarbers:data.popularBarbers});});
shopRoutes.post("/services",async(c)=>{const {tenant,user,repo}=adminContext(c);await new PlanService(c.env.DB).assertCanCreate(tenant.id,"services");const body=parsed(serviceSchema,await c.req.json());return successResponse(c,await repo.saveService(tenant.id,crypto.randomUUID(),{...body,description:body.description??null},user,true),201);});
shopRoutes.put("/services/:id",async(c)=>{const {tenant,user,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));if(!await repo.service(tenant.id,id))throw new AppError(404,"NOT_FOUND","Service not found");const body=parsed(serviceSchema,await c.req.json());return successResponse(c,await repo.saveService(tenant.id,id,{...body,description:body.description??null},user,false));});
shopRoutes.delete("/services/:id",async(c)=>{const {tenant,user,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));if(!await repo.deleteService(tenant.id,id,user))throw new AppError(404,"NOT_FOUND","Service not found");return successResponse(c,{deleted:true});});
shopRoutes.get("/barbers", async (context) => {
  const tenant = context.get("currentTenant");
  if (!tenant) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  return successResponse(context, await new ShopRepository(context.env.DB).shopList(tenant.id, "barbers"));
});
shopRoutes.post("/barbers",async(c)=>{const {tenant,user,repo}=adminContext(c);await new PlanService(c.env.DB).assertCanCreate(tenant.id,"barbers");const body=parsed(barberSchema,await c.req.json());return successResponse(c,await repo.saveBarber(tenant.id,crypto.randomUUID(),{...body,phone:body.phone??null,email:body.email??null,bio:body.bio??null},user,true),201);});
shopRoutes.put("/barbers/:id",async(c)=>{const {tenant,user,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));if(!await repo.barber(tenant.id,id))throw new AppError(404,"NOT_FOUND","Barber not found");const body=parsed(barberSchema,await c.req.json());return successResponse(c,await repo.saveBarber(tenant.id,id,{...body,phone:body.phone??null,email:body.email??null,bio:body.bio??null},user,false));});
shopRoutes.delete("/barbers/:id",async(c)=>{const {tenant,user,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));if(!await repo.deleteBarber(tenant.id,id,user))throw new AppError(404,"NOT_FOUND","Barber not found");return successResponse(c,{deleted:true});});
const workingHoursSchema=z.object({days:z.array(z.object({day_of_week:z.number().int().min(0).max(6),start_time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),end_time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),is_day_off:z.boolean()}).strict()).length(7).refine((days)=>new Set(days.map((day)=>day.day_of_week)).size===7&&days.every((day)=>day.is_day_off||(day.start_time!==null&&day.end_time!==null&&day.start_time<day.end_time)),"Provide all days and valid working time ranges")});
shopRoutes.get("/barbers/:id/working-hours",async(c)=>{const {tenant,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));if(!await repo.barber(tenant.id,id))throw new AppError(404,"NOT_FOUND","Barber not found");return successResponse(c,await repo.workingHours(tenant.id,id));});
shopRoutes.put("/barbers/:id/working-hours",async(c)=>{const {tenant,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));if(!await repo.barber(tenant.id,id))throw new AppError(404,"NOT_FOUND","Barber not found");const body=parsed(workingHoursSchema,await c.req.json());return successResponse(c,await repo.saveWorkingHours(tenant.id,id,body.days));});
shopRoutes.get("/bookings", async (context) => {
  const tenant = context.get("currentTenant");
  const user = context.get("currentUser");
  if (!tenant || !user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const parsed = shopBookingFilterSchema.safeParse(context.req.query());
  if (!parsed.success) throw new AppError(422, "VALIDATION_ERROR", "Booking filters are invalid", parsed.error.issues.map((issue) => ({ code: "INVALID_VALUE", message: issue.message, field: issue.path.join(".") })));
  return successResponse(context, await new BookingRepository(context.env.DB).shopBookings(tenant.id, user, parsed.data));
});
shopRoutes.get("/bookings/:id", async (context) => {
  const tenant = context.get("currentTenant");
  const user = context.get("currentUser");
  if (!tenant || !user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const booking = await new BookingRepository(context.env.DB).bookingForStatus(tenant.id, context.req.param("id"), user);
  if (!booking) throw new AppError(404, "NOT_FOUND", "Booking not found");
  return successResponse(context, booking);
});
shopRoutes.patch("/bookings/:id/status", async (context) => {
  const tenant = context.get("currentTenant");
  const user = context.get("currentUser");
  if (!tenant || !user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const parsed = updateBookingStatusSchema.safeParse(await context.req.json());
  if (!parsed.success) throw new AppError(422, "VALIDATION_ERROR", "Booking status is invalid", parsed.error.issues.map((issue) => ({ code: "INVALID_VALUE", message: issue.message, field: issue.path.join(".") })));
  const booking = await changeBookingStatus(new BookingRepository(context.env.DB), tenant.id, user, context.req.param("id"), parsed.data.status);
  const event=booking?.status==="CONFIRMED"?"BOOKING_CONFIRMED":booking?.status==="CANCELLED"?"BOOKING_CANCELLED":booking?.status==="COMPLETED"?"BOOKING_COMPLETED":null;
  if(booking&&event){const notifications=new NotificationService(context.env,context.env.DB,context.get("requestId"));notifications.safeDispatch(context.executionCtx,notifications.bookingEvent(event,booking,context.executionCtx),tenant.id);}
  return successResponse(context, booking);
});
shopRoutes.get("/customers", async (context) => {
  const {tenant,repo}=adminContext(context);return successResponse(context,await repo.customers(tenant.id,listQuery(context)));
});
shopRoutes.get("/customers/:id",async(c)=>{const {tenant,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));const result=await repo.customer(tenant.id,id);if(!result)throw new AppError(404,"NOT_FOUND","Customer not found");return successResponse(c,result);});
shopRoutes.get("/reviews", async (context) => {
  const {tenant,repo}=adminContext(context);const base=listQuery(context);const status=parsed(z.enum(["PENDING","APPROVED","HIDDEN","REJECTED"]).optional(),context.req.query("status"));return successResponse(context,await repo.reviews(tenant.id,{...base,status}));
});
shopRoutes.patch("/reviews/:id/status",async(c)=>{const {tenant,user,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));const body=parsed(z.object({status:z.enum(["APPROVED","HIDDEN","REJECTED"])}).strict(),await c.req.json());if(!await repo.updateReview(tenant.id,id,body.status,user))throw new AppError(404,"NOT_FOUND","Review not found");return successResponse(c,{updated:true});});
shopRoutes.delete("/reviews/:id",async(c)=>{const {tenant,user,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));if(!await repo.deleteReview(tenant.id,id,user))throw new AppError(404,"NOT_FOUND","Review not found");return successResponse(c,{deleted:true});});
shopRoutes.get("/gallery", async (context) => {
  const tenant = context.get("currentTenant");
  if (!tenant) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  return successResponse(context, await new ShopRepository(context.env.DB).shopList(tenant.id, "gallery"));
});
shopRoutes.put("/gallery/:id",async(c)=>{const {tenant,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));const body=parsed(z.object({title:z.string().trim().min(1).max(160),category:z.string().max(80).nullable()}).strict(),await c.req.json());if(!await repo.updateGallery(tenant.id,id,body.title,body.category))throw new AppError(404,"NOT_FOUND","Gallery item not found");return successResponse(c,{updated:true});});
shopRoutes.delete("/gallery/:id",async(c)=>{const {tenant,user,repo}=adminContext(c);const id=parsed(idParam,c.req.param("id"));const existing=await repo.galleryItem(tenant.id,id);if(!existing)throw new AppError(404,"NOT_FOUND","Gallery item not found");if(existing.r2_key){if(!c.env.MEDIA_BUCKET)throw new AppError(503,"STORAGE_NOT_CONFIGURED","Image uploads are temporarily unavailable because storage is not configured.");try{await new StorageService(c.env.MEDIA_BUCKET).delete(existing.r2_key);}catch(error){logServerError("r2.gallery_delete_failed",c.get("requestId"),error,{key:existing.r2_key});throw new AppError(502,"IMAGE_DELETE_FAILED","Image could not be deleted");}}try{if(!await repo.deleteGallery(tenant.id,id,user))throw new AppError(404,"NOT_FOUND","Gallery item not found");}catch(error){logServerError("r2.gallery_metadata_delete_failed",c.get("requestId"),error,{shopId:tenant.id,id});throw new AppError(500,"MEDIA_METADATA_DELETE_FAILED","Image metadata could not be deleted; retry the operation");}return successResponse(c,{deleted:true});});
shopRoutes.get("/settings", async (context) => {
  const {tenant,repo}=adminContext(context);return successResponse(context,await repo.shopSettings(tenant.id));
});
const settingKeys=["business_name","logo","favicon","phone","email","address","primary_color","secondary_color","accent_color","hero_title","hero_description","hero_image","opening_hours","facebook_url","instagram_url","tiktok_url","google_maps_url","meta_title","meta_description","timezone","booking_advance_days"] as const;
function validOpeningHours(raw:string){
  try {
    const parsed:unknown=JSON.parse(raw);
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return false;
    const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/u;
    return Object.values(parsed).every((day)=>{
      if(day===null)return true;
      if(typeof day==="string")return day.toLowerCase()==="closed"||/^\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}$/u.test(day);
      if(typeof day!=="object"||Array.isArray(day))return false;
      const hours=day as {closed?:unknown;open?:unknown;close?:unknown};
      return hours.closed===true||(typeof hours.open==="string"&&typeof hours.close==="string"&&timePattern.test(hours.open)&&timePattern.test(hours.close)&&hours.open<hours.close);
    });
  } catch { return false; }
}
const settingsSchema=z.object({business:z.object({name:z.string().trim().min(1).max(120),logo_url:z.string().max(2048).nullable(),cover_url:z.string().max(2048).nullable(),phone:z.string().max(40).nullable(),email:z.string().email().nullable(),address:z.string().max(500).nullable(),description:z.string().max(4000).nullable()}).strict(),settings:z.record(z.string(),z.string()).refine((values)=>Object.keys(values).every((key)=>settingKeys.includes(key as typeof settingKeys[number]))&&(!values.opening_hours||validOpeningHours(values.opening_hours)),"Unsupported or invalid shop setting")}).strict();
shopRoutes.put("/settings",async(c)=>{const {tenant,user,repo}=adminContext(c);const body=parsed(settingsSchema,await c.req.json());return successResponse(c,await repo.saveSettings(tenant.id,user,body));});
shopRoutes.get("/profile",async(c)=>{const {tenant,user,repo}=adminContext(c);return successResponse(c,await repo.profile(user.id,tenant.id));});
shopRoutes.put("/profile",async(c)=>{const {tenant,user,repo}=adminContext(c);const body=parsed(z.object({name:z.string().trim().min(1).max(120),phone:z.string().max(40).nullable(),avatar_url:z.null().optional()}).strict(),await c.req.json());return successResponse(c,await repo.saveProfile(user.id,tenant.id,body.name,body.phone));});
shopRoutes.post("/change-password",async(c)=>{const {tenant,user,repo}=adminContext(c);const body=parsed(z.object({current_password:z.string().min(1),new_password:z.string().min(12).max(128)}).strict(),await c.req.json());const row=await repo.passwordHash(user.id,tenant.id);if(!row||!await verifyPassword(body.current_password,row.password_hash))throw new AppError(400,"INVALID_PASSWORD","Current password is incorrect");if(body.current_password===body.new_password)throw new AppError(422,"VALIDATION_ERROR","New password must differ from current password");const session=c.get("currentSession");if(!session)throw new AppError(401,"UNAUTHENTICATED","Authentication required");await repo.setPassword(user.id,tenant.id,await hashPassword(body.new_password),session.id);await repo.audit(tenant.id,user.id,"CHANGE_PASSWORD","user",user.id);return successResponse(c,{updated:true});});
