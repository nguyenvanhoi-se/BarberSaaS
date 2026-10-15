import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/app";
import { NotificationRepository } from "../repositories/notification.repository";
import { NotificationService } from "../notifications/NotificationService";
import { AppError } from "../utils/app-error";
import { successResponse } from "../utils/http-response";
import { rateLimit } from "../middleware/rate-limit";

export const shopNotificationRoutes=new Hono<AppEnv>();
function actor(c:import("hono").Context<AppEnv>){const tenant=c.get("currentTenant"),user=c.get("currentUser");if(!tenant||!user)throw new AppError(401,"UNAUTHENTICATED","Authentication required");return {tenant,user};}

shopNotificationRoutes.get("/config",async(c)=>{
  const {tenant}=actor(c),service=new NotificationService(c.env,c.env.DB,c.get("requestId"));
  return successResponse(c,{...service.status(),settings:await new NotificationRepository(c.env.DB).settings(tenant.id)});
});
shopNotificationRoutes.put("/settings",async(c)=>{
  const {tenant,user}=actor(c);let body:unknown;try{body=await c.req.json();}catch{throw new AppError(400,"INVALID_JSON","Request body must be JSON");}
  const parsed=z.object({booking_email_enabled:z.boolean(),owner_notification_enabled:z.boolean(),reminder_enabled:z.boolean(),payment_email_enabled:z.boolean()}).strict().safeParse(body);
  if(!parsed.success)throw new AppError(422,"VALIDATION_ERROR","Notification settings are invalid");
  const settings=await new NotificationRepository(c.env.DB).saveSettings(tenant.id,user.id,parsed.data);
  return successResponse(c,{settings});
});
shopNotificationRoutes.post("/test-email",rateLimit((env)=>env.EMAIL_RATE_LIMIT??env.AUTH_RATE_LIMIT,"email-test"),async(c)=>{
  const {tenant,user}=actor(c);if(user.role!=="SHOP_OWNER")throw new AppError(403,"FORBIDDEN","Shop Owner access required");
  const result=await new NotificationService(c.env,c.env.DB,c.get("requestId")).sendTestEmail(tenant.id,{id:user.id,name:user.name,email:user.email});
  if(result.status==="DUPLICATE")throw new AppError(429,"EMAIL_TEST_RATE_LIMITED","A test email was already requested recently.");
  if(result.status!=="SENT")throw new AppError(503,result.errorCode??"EMAIL_NOT_CONFIGURED",result.errorCode==="NOT_CONFIGURED"?"Email service is not configured.":"Test email could not be sent.");
  return successResponse(c,{status:"SENT"});
});
