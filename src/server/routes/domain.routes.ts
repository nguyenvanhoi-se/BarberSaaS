import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/app";
import { DomainRepository, type ShopDomain } from "../repositories/domain.repository";
import { CloudflareDomainService, hostnameState } from "../services/cloudflare-domain.service";
import { validateCustomHostname } from "../services/domain-hostname";
import { PlanService } from "../services/plan.service";
import { platformDomain } from "../services/domain-hostname";
import { AppError } from "../utils/app-error";
import { successResponse } from "../utils/http-response";
import { rateLimit } from "../middleware/rate-limit";
import { logServerError } from "../utils/server-log";
import { NotificationService } from "../notifications/NotificationService";

export const domainRoutes=new Hono<AppEnv>();
const connectSchema=z.object({hostname:z.string().trim().min(1).max(300),verification_method:z.enum(["http","txt","email"]).default("txt")}).strict();
const idSchema=z.string().trim().min(1).max(128);
function actor(c:import("hono").Context<AppEnv>){const tenant=c.get("currentTenant"),user=c.get("currentUser");if(!tenant||!user)throw new AppError(401,"UNAUTHENTICATED","Authentication required");return {tenant,user,repo:new DomainRepository(c.env.DB)};}
function mapDomain(domain:ShopDomain){let records:unknown=null;try{records=domain.verification_records?JSON.parse(domain.verification_records):null;}catch{records=null;}return {...domain,verification_records:records};}
function providerMessage(c:import("hono").Context<AppEnv>){const provider=new CloudflareDomainService(c.env);return {enabled:provider.enabled,configured:provider.enabled&&provider.configured,cname_target:provider.config.cnameTarget};}
function auditAction(status:string){return status==="ACTIVE"?"DOMAIN_VERIFIED":status==="FAILED"?"DOMAIN_FAILED":null;}
async function refreshDomain(c:import("hono").Context<AppEnv>,shopId:string,domain:ShopDomain,verify:boolean){
  if(!domain.cloudflare_hostname_id)throw new AppError(503,"DOMAIN_PROVISIONING_NOT_CONFIGURED","Custom domain provisioning is not configured.");
  const provider=new CloudflareDomainService(c.env);if(!provider.enabled||!provider.configured)throw new AppError(503,"DOMAIN_PROVISIONING_NOT_CONFIGURED","Custom domain provisioning is not configured.");
  if(verify){await provider.updateCustomHostname(domain.cloudflare_hostname_id,domain.verification_method);await new DomainRepository(c.env.DB).audit(shopId,c.get("currentUser")!.id,"DOMAIN_VERIFICATION_STARTED",domain,domain.status,domain.status);}
  const details=await provider.getCustomHostnameStatus(domain.cloudflare_hostname_id),state=hostnameState(details),repo=new DomainRepository(c.env.DB);
  await repo.sync(shopId,domain.id,{status:state.status,verificationStatus:state.verification_status,sslStatus:state.ssl_status,records:state.verification_records,cnameTarget:provider.config.cnameTarget});
  const changed=domain.status!==state.status;
  const action=auditAction(state.status);if(changed&&action)await repo.audit(shopId,c.get("currentUser")!.id,action,domain,domain.status,state.status);
  const updated=await repo.find(shopId,domain.id);if(!updated)throw new AppError(500,"DOMAIN_STATUS_SAVE_FAILED","Domain status could not be saved.");
  if(changed&&(state.status==="ACTIVE"||state.status==="FAILED")){const notifications=new NotificationService(c.env,c.env.DB,c.get("requestId"));notifications.safeDispatch(c.executionCtx,notifications.domainStatus(shopId,domain.hostname,state.status,c.executionCtx),shopId);}
  return mapDomain(updated);
}

domainRoutes.get("/",async(c)=>{
  const {tenant,repo}=actor(c),domains=await repo.list(tenant.id),platform=platformDomain(c.env.PLATFORM_DOMAIN);
  const platformHostname=platform?`${tenant.slug}.${platform}`:null;
  const primary=domains.results.find((item)=>item.is_primary===1&&item.status==="ACTIVE"&&item.ssl_status==="ACTIVE")?.hostname??platformHostname;
  return successResponse(c,{platform_domain:platformHostname,domains:domains.results.map(mapDomain),primary_domain:primary,provider:providerMessage(c)});
});
domainRoutes.post("/primary",async(c)=>{
  const {tenant,user,repo}=actor(c),body=z.object({domain_id:z.string().trim().min(1).max(128).nullable()}).strict().safeParse(await c.req.json());
  if(!body.success)throw new AppError(422,"VALIDATION_ERROR","Primary domain selection is invalid");
  if(body.data.domain_id){const domain=await repo.find(tenant.id,body.data.domain_id);if(!domain)throw new AppError(404,"DOMAIN_NOT_FOUND","Domain not found");if(domain.status!=="ACTIVE"||domain.ssl_status!=="ACTIVE")throw new AppError(409,"DOMAIN_NOT_READY","A custom domain must be verified and have an active SSL certificate before it can be primary.");}
  if(!await repo.setPrimary(tenant.id,body.data.domain_id,user.id))throw new AppError(409,"DOMAIN_NOT_READY","Domain is not ready to become primary.");
  const domains=await repo.list(tenant.id),primary=domains.results.find((domain)=>domain.is_primary===1)?.hostname??(platformDomain(c.env.PLATFORM_DOMAIN)?`${tenant.slug}.${platformDomain(c.env.PLATFORM_DOMAIN)}`:null);
  return successResponse(c,{primary_domain:primary});
});
domainRoutes.post("/",rateLimit((env) => env.DOMAIN_RATE_LIMIT,"domain"),async(c)=>{
  const {tenant,user,repo}=actor(c),body=connectSchema.safeParse(await c.req.json());
  if(!body.success)throw new AppError(422,"VALIDATION_ERROR","Domain details are invalid",body.error.issues.map((issue)=>({code:"INVALID_VALUE",message:issue.message,field:issue.path.join(".")})));
  await new PlanService(c.env.DB).requireFeature(tenant.id,"custom_domain");
  const hostname=validateCustomHostname(body.data.hostname,c.env.PLATFORM_DOMAIN?platformDomain(c.env.PLATFORM_DOMAIN):null,c.env.APP_ENV);
  const existing=await repo.findByHostname(hostname);if(existing)throw new AppError(409,"DOMAIN_ALREADY_CLAIMED","This hostname is already registered and must be removed from its current Cloudflare configuration before it can be claimed.");
  const provider=new CloudflareDomainService(c.env);let cloudflare:null|Awaited<ReturnType<CloudflareDomainService["createCustomHostname"]>>=null;
  if(provider.enabled){if(!provider.configured)throw new AppError(503,"DOMAIN_PROVISIONING_NOT_CONFIGURED","Custom domain provisioning is not configured.");cloudflare=await provider.createCustomHostname(hostname,body.data.verification_method);}
  const state:{status:ShopDomain["status"];verification_status:string;ssl_status:string;verification_records:unknown}=cloudflare?hostnameState(cloudflare):{status:"PENDING",verification_status:"PENDING",ssl_status:"PENDING",verification_records:provider.config.cnameTarget?[{type:"CNAME",name:hostname,value:provider.config.cnameTarget}]:[]};
  const id=crypto.randomUUID();
  try{
    await repo.create({id,shopId:tenant.id,hostname,method:body.data.verification_method,cloudflareHostnameId:cloudflare?.id??null,cnameTarget:provider.config.cnameTarget,status:state.status,verificationStatus:state.verification_status,sslStatus:state.ssl_status,records:state.verification_records});
  }catch(error){if(cloudflare){try{await provider.deleteCustomHostname(cloudflare.id);}catch(cleanupError){logServerError("domain.cloudflare_cleanup_failed",c.get("requestId"),cleanupError,{hostname});}}if(error instanceof Error&&/UNIQUE constraint failed/iu.test(error.message))throw new AppError(409,"DOMAIN_ALREADY_CLAIMED","This hostname is already registered and must be removed from its current Cloudflare configuration before it can be claimed.");logServerError("domain.save_failed",c.get("requestId"),error);throw new AppError(500,"DOMAIN_SAVE_FAILED","Custom domain could not be saved.");}
  const created=await repo.find(tenant.id,id);if(!created)throw new AppError(500,"DOMAIN_SAVE_FAILED","Custom domain could not be loaded.");
  await repo.audit(tenant.id,user.id,"DOMAIN_ADDED",created,null,created.status);
  if(created.status==="ACTIVE"){const notifications=new NotificationService(c.env,c.env.DB,c.get("requestId"));notifications.safeDispatch(c.executionCtx,notifications.domainStatus(tenant.id,created.hostname,"ACTIVE",c.executionCtx),tenant.id);}
  return successResponse(c,{...mapDomain(created),provider:providerMessage(c)},201);
});
domainRoutes.get("/:id/status",rateLimit((env) => env.DOMAIN_RATE_LIMIT,"domain"),async(c)=>{const {tenant,repo}=actor(c),id=idSchema.parse(c.req.param("id")),domain=await repo.find(tenant.id,id);if(!domain)throw new AppError(404,"DOMAIN_NOT_FOUND","Domain not found");return successResponse(c,await refreshDomain(c,tenant.id,domain,false));});
domainRoutes.get("/:id",async(c)=>{const {tenant,repo}=actor(c),id=idSchema.parse(c.req.param("id")),domain=await repo.find(tenant.id,id);if(!domain)throw new AppError(404,"DOMAIN_NOT_FOUND","Domain not found");return successResponse(c,{...mapDomain(domain),provider:providerMessage(c)});});
domainRoutes.post("/:id/verify",rateLimit((env) => env.DOMAIN_RATE_LIMIT,"domain"),async(c)=>{const {tenant,repo}=actor(c),id=idSchema.parse(c.req.param("id")),domain=await repo.find(tenant.id,id);if(!domain)throw new AppError(404,"DOMAIN_NOT_FOUND","Domain not found");if(domain.status==="DISABLED")throw new AppError(409,"DOMAIN_DISABLED","This domain has been removed.");return successResponse(c,await refreshDomain(c,tenant.id,domain,true));});
domainRoutes.delete("/:id",async(c)=>{
  const {tenant,user,repo}=actor(c),id=idSchema.parse(c.req.param("id")),domain=await repo.find(tenant.id,id);if(!domain)throw new AppError(404,"DOMAIN_NOT_FOUND","Domain not found");
  if(domain.is_primary===1)throw new AppError(409,"PRIMARY_DOMAIN_REQUIRED","Set another primary domain before removing this one.");
  const provider=new CloudflareDomainService(c.env);if(domain.cloudflare_hostname_id){if(!provider.enabled||!provider.configured)throw new AppError(503,"DOMAIN_PROVISIONING_NOT_CONFIGURED","Cloudflare cleanup must be configured before this domain can be removed.");await provider.deleteCustomHostname(domain.cloudflare_hostname_id);}
  if(!await repo.disable(tenant.id,id,user.id,null,domain.hostname,domain.status))throw new AppError(409,"DOMAIN_ALREADY_REMOVED","This domain is already removed.");
  return successResponse(c,{id,hostname:domain.hostname,status:"DISABLED"});
});
