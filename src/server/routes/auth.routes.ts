import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/app";
import { AuthRepository } from "../repositories/auth.repository";
import { requireAuth } from "../middleware/auth";
import { resolveTenantIfPresent } from "../middleware/tenant";
import { isPlatformHost } from "../services/tenant.service";
import { cookieHeader, expiredCookieHeader, login, refreshSession, registerCustomer } from "../services/auth.service";
import { AppError } from "../utils/app-error";
import { successResponse } from "../utils/http-response";
import { hashPassword, sha256Hex } from "../utils/crypto";
import { MediaRepository } from "../repositories/media.repository";
import { publicImageUrl, StorageService, userImageKey, validateImageFile } from "../services/storage.service";
import { rateLimit } from "../middleware/rate-limit";
import { logServerError } from "../utils/server-log";
import { NotificationService } from "../notifications/NotificationService";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(32).optional(),
  password: z.string().min(12).max(128),
});
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError(422, "VALIDATION_ERROR", "Request validation failed", result.error.issues.map((issue) => ({ code: "INVALID_VALUE", message: issue.message, field: issue.path.join(".") })));
  return result.data;
}

export const authRoutes = new Hono<AppEnv>();
authRoutes.use("*", resolveTenantIfPresent);

authRoutes.post("/register", rateLimit((env) => env.AUTH_RATE_LIMIT, "auth"), async (context) => {
  const tenant = context.get("currentTenant");
  if (!tenant) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  if (tenant.status !== "ACTIVE") throw new AppError(403, "SHOP_UNAVAILABLE", "This shop is not currently available");
  const input = parseBody(registerSchema, await context.req.json());
  const result = await registerCustomer(new AuthRepository(context.env.DB), tenant.id, input);
  const notifications=new NotificationService(context.env,context.env.DB,context.get("requestId"));
  notifications.safeDispatch(context.executionCtx,notifications.welcome(tenant.id,result.user,context.executionCtx),tenant.id);
  context.header("Set-Cookie", cookieHeader(result.token));
  context.header("Cache-Control", "no-store");
  return successResponse(context, { user: result.user }, 201);
});

authRoutes.post("/accept-owner-invite",rateLimit((env) => env.AUTH_RATE_LIMIT, "auth"),async(context)=>{
  const tenant=context.get("currentTenant");if(!tenant)throw new AppError(404,"SHOP_NOT_FOUND","Shop not found");
  if(tenant.status!=="ACTIVE")throw new AppError(403,"SHOP_UNAVAILABLE","This shop is not currently available");
  const input=parseBody(z.object({token:z.string().min(32).max(200),password:z.string().min(12).max(128)}).strict(),await context.req.json());
  const accepted=await new AuthRepository(context.env.DB).claimOwnerInvite(tenant.id,await sha256Hex(input.token),await hashPassword(input.password));
  if(!accepted)throw new AppError(400,"INVITE_INVALID","This invitation is invalid, expired, or already used");
  context.header("Cache-Control","no-store");return successResponse(context,{accepted:true});
});

authRoutes.post("/login", rateLimit((env) => env.AUTH_RATE_LIMIT, "auth"), async (context) => {
  const input = parseBody(loginSchema, await context.req.json());
  const tenant = context.get("currentTenant");
  if (!tenant && !isPlatformHost(context)) throw new AppError(404, "SHOP_NOT_FOUND", "Shop not found");
  if (tenant && tenant.status !== "ACTIVE") throw new AppError(403, "SHOP_UNAVAILABLE", "This shop is not currently available");
  const authenticated = await login(new AuthRepository(context.env.DB), input.email, input, tenant?.id ?? null);
  if(authenticated.user.role==="SUPER_ADMIN")await context.env.DB.prepare(`INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id)
    VALUES(?,NULL,?,'SUPER_ADMIN_LOGIN','user',?)`).bind(crypto.randomUUID(),authenticated.user.id,authenticated.user.id).run();
  context.header("Set-Cookie", cookieHeader(authenticated.token));
  context.header("Cache-Control", "no-store");
  return successResponse(context, { user: authenticated.user });
});

authRoutes.use("/me", requireAuth);
authRoutes.get("/me", (context) => {
  context.header("Cache-Control", "no-store");
  return successResponse(context, { user: context.get("currentUser") });
});

authRoutes.use("/avatar",requireAuth);
authRoutes.post("/avatar",rateLimit((env) => env.UPLOAD_RATE_LIMIT, "upload"),async(context)=>{
  const user=context.get("currentUser");if(!user)throw new AppError(401,"UNAUTHENTICATED","Authentication required");
  let form:FormData;try{form=await context.req.formData();}catch{throw new AppError(400,"INVALID_MULTIPART","A multipart image upload is required");}
  const file=form.get("file");if(!(file instanceof File))throw new AppError(422,"INVALID_IMAGE","Choose a JPEG, PNG, or WebP image");
  const mime=await validateImageFile(file,5*1024*1024);const repository=new MediaRepository(context.env.DB);const storage=new StorageService(context.env.MEDIA_BUCKET);
  const oldKey=await repository.currentUserMedia(user.id);const key=userImageKey(user.id,mime);const url=publicImageUrl(key);
  try{await storage.upload(key,file.stream(),mime,{user_id:user.id,kind:"user_avatar"});}
  catch(error){try{await storage.delete(key);}catch(cleanupError){logServerError("r2.cleanup_failed",context.get("requestId"),cleanupError,{key});}logServerError("r2.user_avatar_upload_failed",context.get("requestId"),error);throw new AppError(502,"UPLOAD_FAILED","Image upload failed");}
  try{await repository.saveUserMedia(user.id,key,url,file.size,mime);}
  catch(error){try{await storage.delete(key);}catch(cleanupError){logServerError("r2.cleanup_failed",context.get("requestId"),cleanupError,{key});}logServerError("r2.user_avatar_metadata_failed",context.get("requestId"),error);throw new AppError(500,"MEDIA_METADATA_SAVE_FAILED","Image could not be saved");}
  let cleanupPending=false;if(oldKey&&oldKey!==key&&!await repository.isReferenced(oldKey)){try{await storage.delete(oldKey);}catch(error){cleanupPending=true;logServerError("r2.old_user_avatar_cleanup_failed",context.get("requestId"),error,{key:oldKey});}}
  return successResponse(context,{id:user.id,r2_key:key,url,file_size:file.size,mime_type:mime,cleanup_pending:cleanupPending});
});
authRoutes.delete("/avatar",async(context)=>{
  const user=context.get("currentUser");if(!user)throw new AppError(401,"UNAUTHENTICATED","Authentication required");
  const repository=new MediaRepository(context.env.DB);const storage=new StorageService(context.env.MEDIA_BUCKET);const key=await repository.currentUserMedia(user.id);
  if(key){try{await storage.delete(key);}catch(error){logServerError("r2.user_avatar_delete_failed",context.get("requestId"),error,{key});throw new AppError(502,"IMAGE_DELETE_FAILED","Image could not be deleted");}}
  try{await repository.clearUserMedia(user.id);}catch(error){logServerError("r2.user_avatar_metadata_delete_failed",context.get("requestId"),error,{userId:user.id});throw new AppError(500,"MEDIA_METADATA_DELETE_FAILED","Image metadata could not be deleted; retry the operation");}
  return successResponse(context,{deleted:true});
});

authRoutes.use("/refresh", requireAuth);
authRoutes.post("/refresh", async (context) => {
  const session = context.get("currentSession");
  if (!session) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const result = await refreshSession(new AuthRepository(context.env.DB), session);
  context.header("Set-Cookie", cookieHeader(result.token));
  context.header("Cache-Control", "no-store");
  return successResponse(context, { user: result.user });
});

authRoutes.use("/logout", requireAuth);
authRoutes.post("/logout", async (context) => {
  const session = context.get("currentSession");
  if (session) await new AuthRepository(context.env.DB).revokeSession(session.id);
  context.header("Set-Cookie", expiredCookieHeader());
  context.header("Cache-Control", "no-store");
  return successResponse(context, { logged_out: true });
});
