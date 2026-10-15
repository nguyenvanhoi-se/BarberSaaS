import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/app";
import { requireAuth, requireRole } from "../middleware/auth";
import { resolveTenantIfPresent } from "../middleware/tenant";
import { SuperAdminRepository } from "../repositories/super-admin.repository";
import { PLAN_CATALOG } from "../services/plan-catalog";
import { AppError } from "../utils/app-error";
import { successResponse } from "../utils/http-response";
import { createOpaqueToken, hashPassword, sha256Hex, verifyPassword } from "../utils/crypto";
import { RESERVED_SUBDOMAINS, validateCustomHostname, platformDomain } from "../services/domain-hostname";
import { DomainRepository } from "../repositories/domain.repository";
import { CloudflareDomainService } from "../services/cloudflare-domain.service";
import { BillingRepository } from "../repositories/billing.repository";
import { BillingService } from "../billing/BillingService";
import { NotificationService } from "../notifications/NotificationService";

export const superAdminRoutes = new Hono<AppEnv>();
superAdminRoutes.use("*", resolveTenantIfPresent, requireAuth, requireRole("SUPER_ADMIN"));

const planSchema=z.enum(["BASIC","PRO","PREMIUM"]);
const idSchema=z.string().trim().min(1).max(200);
const pageSchema=z.object({page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20),search:z.string().trim().max(120).optional()});
function parse<T>(schema:z.ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new AppError(422,"VALIDATION_ERROR","Request data is invalid",result.error.issues.map(issue=>({code:"INVALID_VALUE",message:issue.message,field:issue.path.join(".")})));return result.data;}
function actor(context:import("hono").Context<AppEnv>){const user=context.get("currentUser");if(!user||user.role!=="SUPER_ADMIN"||user.shop_id!==null)throw new AppError(403,"FORBIDDEN","Super Admin access required");return user;}
function repo(context:import("hono").Context<AppEnv>){return new SuperAdminRepository(context.env.DB);}
function id(context:import("hono").Context<AppEnv>){return parse(idSchema,context.req.param("id"));}
function validationConflict(error:unknown):never{if(error instanceof Error&&/(UNIQUE constraint failed|constraint failed)/iu.test(error.message))throw new AppError(409,"CONFLICT","A shop with this slug or domain already exists");throw error;}

superAdminRoutes.get("/dashboard",async(c)=>successResponse(c,await repo(c).dashboard()));
superAdminRoutes.get("/notification-status",(c)=>successResponse(c,new NotificationService(c.env,c.env.DB,c.get("requestId")).status()));
superAdminRoutes.get("/plans",(c)=>successResponse(c,Object.entries(PLAN_CATALOG).map(([key,value])=>({id:key,...value,pricingConfigured:value.monthlyPrice!==null}))));
superAdminRoutes.get("/statistics",async(c)=>{const query=parse(z.object({range:z.enum(["7","30","90","365"]).default("30")}),c.req.query());return successResponse(c,await repo(c).statistics(Number(query.range) as 7|30|90|365));});

superAdminRoutes.get("/shops",async(c)=>{
  const query=parse(pageSchema.extend({status:z.enum(["ACTIVE","SUSPENDED","INACTIVE"]).optional()}),c.req.query());
  return successResponse(c,await repo(c).shops(query));
});
superAdminRoutes.get("/shops/:id/statistics",async(c)=>{const shopId=id(c);if(!await repo(c).shop(shopId))throw new AppError(404,"NOT_FOUND","Shop not found");return successResponse(c,await repo(c).shopStatistics(shopId));});
superAdminRoutes.get("/shops/:id/domains",async(c)=>{const shopId=id(c);if(!await repo(c).shop(shopId))throw new AppError(404,"NOT_FOUND","Shop not found");const domains=await new DomainRepository(c.env.DB).shopDomains(shopId);return successResponse(c,{platform_domain:`${(await repo(c).shop(shopId))!.slug}.${platformDomain(c.env.PLATFORM_DOMAIN)??"localhost"}`,primary_domain:domains.results.find((domain)=>domain.is_primary===1)?.hostname??`${(await repo(c).shop(shopId))!.slug}.${platformDomain(c.env.PLATFORM_DOMAIN)??"localhost"}`,domains:domains.results});});
superAdminRoutes.delete("/shops/:shopId/domains/:id",async(c)=>{const shopId=parse(idSchema,c.req.param("shopId"));const domainId=parse(idSchema,c.req.param("id"));if(!await repo(c).shop(shopId))throw new AppError(404,"NOT_FOUND","Shop not found");const domains=new DomainRepository(c.env.DB);const domain=await domains.find(shopId,domainId);if(!domain)throw new AppError(404,"DOMAIN_NOT_FOUND","Domain not found");if(domain.cloudflare_hostname_id){const provider=new CloudflareDomainService(c.env);if(!provider.enabled||!provider.configured)throw new AppError(503,"DOMAIN_PROVISIONING_NOT_CONFIGURED","Cloudflare cleanup must be configured before this domain can be removed.");await provider.deleteCustomHostname(domain.cloudflare_hostname_id);}const removed=await domains.setSuperAdminStatus(domainId,"DISABLED",actor(c).id,null);if(!removed)throw new AppError(404,"DOMAIN_NOT_FOUND","Domain not found");return successResponse(c,{id:domainId,hostname:domain.hostname,status:"DISABLED"});});
superAdminRoutes.get("/shops/:id",async(c)=>{const shop=await repo(c).shop(id(c));if(!shop)throw new AppError(404,"NOT_FOUND","Shop not found");return successResponse(c,shop);});

const createShopSchema=z.object({name:z.string().trim().min(1).max(120),slug:z.string().trim().toLowerCase().min(1).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).refine(value=>!RESERVED_SUBDOMAINS.has(value),"This subdomain is reserved"),domain:z.string().trim().toLowerCase().max(253).nullable().optional(),owner_name:z.string().trim().min(1).max(120),owner_email:z.string().trim().email().max(254),owner_phone:z.string().trim().max(32).nullable().optional(),plan:planSchema});
superAdminRoutes.post("/shops",async(c)=>{
  const user=actor(c);const input=parse(createShopSchema,await c.req.json());const shopId=crypto.randomUUID();const ownerId=crypto.randomUUID();const token=createOpaqueToken();const inaccessiblePassword=createOpaqueToken();
  if(input.domain){const hostname=validateCustomHostname(input.domain,platformDomain(c.env.PLATFORM_DOMAIN),c.env.APP_ENV);if(await new DomainRepository(c.env.DB).findByHostname(hostname))throw new AppError(409,"DOMAIN_ALREADY_CLAIMED","This hostname is already registered");throw new AppError(422,"DOMAIN_ONBOARDING_REQUIRED","Create the shop first, then connect its custom domain from shop settings so ownership can be verified.");}
  const now=new Date();const started=now.toISOString();const trialEnd=new Date(now.getTime()+14*86400000).toISOString();const expires=new Date(now.getTime()+24*3600000).toISOString();
  try{await repo(c).createShop({shopId,ownerId,subscriptionId:crypto.randomUUID(),inviteId:crypto.randomUUID(),name:input.name,slug:input.slug,domain:null,plan:input.plan,ownerName:input.owner_name,ownerEmail:input.owner_email.toLowerCase(),ownerPhone:input.owner_phone?.trim()||null,ownerPasswordHash:await hashPassword(inaccessiblePassword),tokenHash:await sha256Hex(token),inviteExpiry:expires,superAdminId:user.id,startedAt:started,expiredAt:trialEnd});}
  catch(error){validationConflict(error);}
  const root=platformDomain(c.env.PLATFORM_DOMAIN);const host=root?`${input.slug}.${root}`:null;const protocol=host?.endsWith("localhost")?"http":"https";
  return successResponse(c,{shop_id:shopId,owner_email:input.owner_email.toLowerCase(),slug:input.slug,domain:null,platform_domain:host,invite_url:host?`${protocol}://${host}/accept-invite?token=${encodeURIComponent(token)}`:null,invite_expires_at:expires,plan:input.plan},201);
});

const updateShopSchema=z.object({name:z.string().trim().min(1).max(120),slug:z.string().trim().toLowerCase().min(1).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).refine(value=>!RESERVED_SUBDOMAINS.has(value),"This subdomain is reserved"),domain:z.null().optional(),plan:planSchema}).strict();
superAdminRoutes.put("/shops/:id",async(c)=>{const currentId=id(c);const input=parse(updateShopSchema,await c.req.json());if(!await repo(c).shop(currentId))throw new AppError(404,"NOT_FOUND","Shop not found");try{const result=await repo(c).updateShop(currentId,{...input,domain:null},actor(c).id);return successResponse(c,result);}catch(error){validationConflict(error);}});
const shopStatusSchema=z.object({status:z.enum(["ACTIVE","SUSPENDED","INACTIVE"])}).strict();
superAdminRoutes.patch("/shops/:id/status",async(c)=>{const shopId=id(c);const user=actor(c);const input=parse(shopStatusSchema,await c.req.json());if(!await repo(c).shop(shopId))throw new AppError(404,"NOT_FOUND","Shop not found");const action=input.status==="ACTIVE"?"ACTIVATE_SHOP":input.status==="SUSPENDED"?"SUSPEND_SHOP":"UPDATE_SHOP";await repo(c).setShopStatus(shopId,input.status,user.id,action);return successResponse(c,{shop_id:shopId,status:input.status});});
superAdminRoutes.delete("/shops/:id",async(c)=>{const shopId=id(c);const user=actor(c);if(!await repo(c).shop(shopId))throw new AppError(404,"NOT_FOUND","Shop not found");await repo(c).setShopStatus(shopId,"INACTIVE",user.id,"DELETE_SHOP");return successResponse(c,{shop_id:shopId,status:"INACTIVE"});});

superAdminRoutes.get("/users",async(c)=>{const query=parse(pageSchema.extend({role:z.enum(["SUPER_ADMIN","SHOP_OWNER","BARBER","CUSTOMER"]).optional(),shop_id:z.string().max(200).optional(),status:z.enum(["ACTIVE","SUSPENDED","INACTIVE"]).optional()}),c.req.query());return successResponse(c,await repo(c).users(query));});
superAdminRoutes.get("/users/:id",async(c)=>{const result=await repo(c).user(id(c));if(!result)throw new AppError(404,"NOT_FOUND","User not found");return successResponse(c,result);});
superAdminRoutes.patch("/users/:id/status",async(c)=>{const user=actor(c);const userId=id(c);const input=parse(z.object({status:z.enum(["ACTIVE","SUSPENDED"])}).strict(),await c.req.json());try{if(!await repo(c).setUserStatus(userId,input.status,user.id))throw new AppError(404,"NOT_FOUND","User not found");}catch(error){if(error instanceof Error&&error.message==="LAST_SUPER_ADMIN")throw new AppError(409,"LAST_SUPER_ADMIN","The last active Super Admin cannot be suspended");throw error;}return successResponse(c,{user_id:userId,status:input.status});});

superAdminRoutes.get("/subscriptions",async(c)=>{const query=parse(pageSchema.extend({status:z.enum(["TRIALING","ACTIVE","PAST_DUE","CANCELLED","EXPIRED"]).optional(),plan:planSchema.optional(),shop_id:z.string().max(200).optional()}),c.req.query());return successResponse(c,await repo(c).subscriptions(query));});
superAdminRoutes.get("/subscriptions/:id",async(c)=>{const result=await repo(c).subscription(id(c));if(!result)throw new AppError(404,"NOT_FOUND","Subscription not found");return successResponse(c,result);});
const subscriptionSchema=z.object({plan:planSchema,status:z.enum(["TRIALING","ACTIVE","PAST_DUE","CANCELLED","EXPIRED"]),billing_interval:z.enum(["MONTHLY","YEARLY"]).default("MONTHLY"),expired_at:z.union([z.string().datetime(),z.string().date()]).nullable().transform(value=>value&&/^\d{4}-\d{2}-\d{2}$/u.test(value)?`${value}T23:59:59.999Z`:value)}).strict().refine(value=>value.expired_at===null||new Date(value.expired_at).getTime()>=0,"Invalid expiration date");
superAdminRoutes.patch("/subscriptions/:id",async(c)=>{const subscriptionId=id(c);const input=parse(subscriptionSchema,await c.req.json());const current=await repo(c).subscription(subscriptionId);if(!current)throw new AppError(404,"NOT_FOUND","Subscription not found");if(input.expired_at&&input.expired_at<String(current.started_at))throw new AppError(422,"VALIDATION_ERROR","Expiration must not precede the subscription start date");await repo(c).updateSubscription(subscriptionId,input,actor(c).id);return successResponse(c,await repo(c).subscription(subscriptionId));});

const billingQuerySchema=pageSchema.extend({status:z.enum(["PENDING","PROCESSING","PAID","FAILED","CANCELLED","REFUNDED","DRAFT","OPEN","VOID","OVERDUE"]).optional(),shop_id:z.string().max(200).optional()});
superAdminRoutes.get("/payments",async(c)=>{const query=parse(billingQuerySchema,c.req.query());return successResponse(c,await new BillingRepository(c.env.DB).globalPayments(query));});
superAdminRoutes.get("/payments/:id",async(c)=>{const result=await new BillingRepository(c.env.DB).globalPayment(id(c));if(!result)throw new AppError(404,"NOT_FOUND","Payment not found");return successResponse(c,result);});
superAdminRoutes.get("/invoices",async(c)=>{const query=parse(billingQuerySchema,c.req.query());return successResponse(c,await new BillingRepository(c.env.DB).globalInvoices(query));});
superAdminRoutes.get("/invoices/:id",async(c)=>{const result=await new BillingRepository(c.env.DB).globalInvoice(id(c));if(!result)throw new AppError(404,"NOT_FOUND","Invoice not found");return successResponse(c,result);});
superAdminRoutes.post("/payments/:id/manual-confirm",async(c)=>{const paymentId=id(c);const input=parse(z.object({reason:z.string().trim().min(8).max(500)}).strict(),await c.req.json());const repository=new BillingRepository(c.env.DB);const payment=await repository.globalPayment(paymentId);if(!payment)throw new AppError(404,"NOT_FOUND","Payment not found");if(payment.status!=="PENDING")throw new AppError(409,"PAYMENT_STATE_CONFLICT","Only pending payments can be manually confirmed.");try{const updated=await repository.manualConfirm(payment,actor(c).id,input.reason);if(!updated)throw new Error("PAYMENT_STATE_CONFLICT");if(updated.status==="PAID"){const notifications=new NotificationService(c.env,c.env.DB,c.get("requestId"));notifications.safeDispatch(c.executionCtx,notifications.paymentStatus(payment.shop_id,{...payment,status:updated.status},c.executionCtx),payment.shop_id);}return successResponse(c,updated);}catch(error){if(error instanceof Error&&error.message==="PAYMENT_STATE_CONFLICT")throw new AppError(409,"PAYMENT_STATE_CONFLICT","Payment state changed; reload before retrying.");throw error;}});
superAdminRoutes.get("/billing/reconciliation",async(c)=>successResponse(c,await new BillingService(c.env.DB,c.env).reconciliation()));

superAdminRoutes.get("/audit-logs",async(c)=>{const query=parse(pageSchema.extend({user_id:z.string().max(200).optional(),shop_id:z.string().max(200).optional(),action:z.string().trim().max(100).optional(),date_from:z.string().date().optional(),date_to:z.string().date().optional()}),c.req.query());return successResponse(c,await repo(c).auditLogs(query));});

superAdminRoutes.get("/profile",async(c)=>successResponse(c,await repo(c).superAdminProfile(actor(c).id)));
superAdminRoutes.put("/profile",async(c)=>{const user=actor(c);const input=parse(z.object({name:z.string().trim().min(1).max(120),phone:z.string().max(32).nullable(),avatar_url:z.null().optional()}).strict(),await c.req.json());return successResponse(c,await repo(c).updateSuperAdminProfile(user.id,input.name,input.phone));});
superAdminRoutes.post("/change-password",async(c)=>{const user=actor(c);const input=parse(z.object({current_password:z.string().min(1),new_password:z.string().min(12).max(128)}).strict(),await c.req.json());const row=await repo(c).userPassword(user.id);if(!row||!await verifyPassword(input.current_password,row.password_hash))throw new AppError(400,"INVALID_PASSWORD","Current password is incorrect");if(input.current_password===input.new_password)throw new AppError(422,"VALIDATION_ERROR","New password must differ from current password");const session=c.get("currentSession");if(!session)throw new AppError(401,"UNAUTHENTICATED","Authentication required");await repo(c).changeSuperAdminPassword(user.id,await hashPassword(input.new_password),session.id);await repo(c).audit(null,user.id,"CHANGE_PASSWORD","user",user.id);return successResponse(c,{updated:true});});
