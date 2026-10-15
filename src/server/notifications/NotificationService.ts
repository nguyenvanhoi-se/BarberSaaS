import type { Bindings } from "../types/bindings";
import type { BookingSummary } from "../repositories/booking.repository";
import { NotificationRepository } from "../repositories/notification.repository";
import { logServerError } from "../utils/server-log";
import { EmailService, type EmailJob } from "./EmailService";
import { DirectNotificationQueue } from "./NotificationQueue";
import type { TemplateData } from "./email-templates";

type ExecutionContextLike={waitUntil(promise:Promise<unknown>):void};
type EventName="BOOKING_CREATED"|"BOOKING_CONFIRMED"|"BOOKING_CANCELLED"|"BOOKING_COMPLETED"|"BOOKING_REMINDER"|"WELCOME"|"PAYMENT_PAID"|"PAYMENT_FAILED"|"SUBSCRIPTION_EXPIRING"|"DOMAIN_ACTIVE"|"DOMAIN_FAILED";
type ShopContext=NonNullable<Awaited<ReturnType<NotificationRepository["shopContext"]>>>;

export class NotificationService {
  private readonly repo:NotificationRepository;
  private readonly email:EmailService;
  private readonly queue:DirectNotificationQueue;
  constructor(private readonly env:Bindings,db:D1Database,private readonly requestId="background"){
    this.repo=new NotificationRepository(db);this.email=new EmailService(env,db);this.queue=new DirectNotificationQueue(this.email);
  }
  status(){return this.email.healthCheck();}
  safeDispatch(context:ExecutionContextLike,task:Promise<unknown>,shopId:string|null){context.waitUntil(task.catch((error)=>logServerError("notification.dispatch_failed",this.requestId,error,{shopId})));}
  defer(context:ExecutionContextLike,job:EmailJob){context.waitUntil(this.queue.enqueue(job,this.requestId).catch((error)=>{logServerError("notification.dispatch_failed",this.requestId,error,{shopId:job.shopId,template:job.data.template});}));}

  async bookingEvent(event:Exclude<EventName,"WELCOME"|"PAYMENT_PAID"|"PAYMENT_FAILED"|"SUBSCRIPTION_EXPIRING"|"DOMAIN_ACTIVE"|"DOMAIN_FAILED">,booking:BookingSummary,context:ExecutionContextLike){
    const shop=await this.repo.shopContext(booking.shop_id);if(!shop)return;
    const template=event.toLowerCase() as TemplateData["template"];
    const audience:TemplateData={template:template as "booking_created"|"booking_confirmed"|"booking_cancelled"|"booking_completed"|"booking_reminder",data:this.bookingData(shop,booking,"customer")};
    if(event==="BOOKING_CREATED"&&shop.booking_email_enabled!=="false")this.defer(context,this.job(shop,booking.customer_id,booking.customer_email,`booking:${booking.id}:booking_created:customer`,audience));
    if(event!=="BOOKING_CREATED"&&shop.booking_email_enabled!=="false")this.defer(context,this.job(shop,booking.customer_id,booking.customer_email,`booking:${booking.id}:${template}:customer`,audience));
    if(event==="BOOKING_CREATED"&&shop.owner_notification_enabled!=="false"&&shop.owner_email){
      const ownerData:TemplateData={template:"booking_created",data:this.bookingData(shop,booking,"owner")};
      this.defer(context,this.job(shop,null,shop.owner_email,`booking:${booking.id}:booking_created:owner`,ownerData));
    }else if(event==="BOOKING_CREATED"&&shop.owner_notification_enabled!=="false")console.warn(JSON.stringify({event:"notification.owner_email_missing",shopId:shop.id,bookingId:booking.id}));
  }

  async welcome(shopId:string,user:{id:string;name:string;email:string},context:ExecutionContextLike){
    const shop=await this.repo.shopContext(shopId);if(!shop)return;
    const data:TemplateData={template:"welcome",data:{customerName:user.name,shopName:shop.name,shopUrl:this.shopUrl(shop),logoUrl:shop.logo_url}};
    this.defer(context,this.job(shop,user.id,user.email,`user:${user.id}:welcome`,data));
  }

  async domainStatus(shopId:string,hostname:string,status:"ACTIVE"|"FAILED",context:ExecutionContextLike){
    const shop=await this.repo.shopContext(shopId);if(!shop?.owner_email)return;
    const template=status==="ACTIVE"?"domain_verified":"domain_failed";
    const data:TemplateData={template,data:{ownerName:shop.owner_name??"Shop Owner",shopName:shop.name,hostname,domainsUrl:this.shopUrl(shop)+"/admin/settings/domains",logoUrl:shop.logo_url}};
    this.defer(context,this.job(shop,null,shop.owner_email,`domain:${shopId}:${hostname}:${status}`,data));
  }

  async paymentStatus(shopId:string,input:{id:string;status:string;amount:number;currency:string;invoice_number:string;plan:string},context:ExecutionContextLike){
    if(input.status!=="PAID"&&input.status!=="FAILED")return;
    const shop=await this.repo.shopContext(shopId);if(!shop?.owner_email||shop.payment_email_enabled==="false")return;
    const template=input.status==="PAID"?"payment_success":"payment_failed";
    const data:TemplateData={template,data:{ownerName:shop.owner_name??"Shop Owner",shopName:shop.name,plan:input.plan,amount:input.amount,currency:input.currency,invoiceNumber:input.invoice_number,billingUrl:this.shopUrl(shop)+"/admin/billing",logoUrl:shop.logo_url}};
    this.defer(context,this.job(shop,null,shop.owner_email,`payment:${input.id}:${template}`,data));
  }

  async sendTestEmail(shopId:string,user:{id:string;email:string;name:string}){
    const shop=await this.repo.shopContext(shopId);if(!shop)return {status:"FAILED",errorCode:"SHOP_NOT_FOUND"};
    const data:TemplateData={template:"welcome",data:{customerName:user.name,shopName:shop.name,shopUrl:this.shopUrl(shop),logoUrl:shop.logo_url}};
    const outcome=await this.queue.consume(this.job(shop,user.id,user.email,`test-email:${shopId}:${user.id}:${new Date().toISOString().slice(0,13)}`,data),this.requestId);
    return outcome;
  }

  async runScheduled(now:Date){
    const hours=boundedInteger(this.env.REMINDER_HOURS_BEFORE,24,1,168);
    // Fetch a generous date envelope for tenant wall clocks, then apply an exact local-time window below.
    const today=new Date(now.getTime()-24*60*60*1000).toISOString().slice(0,10);
    const through=new Date(now.getTime()+(hours+48)*60*60*1000).toISOString().slice(0,10);
    const candidates=await this.repo.reminderCandidates(today,through);let queued=0;
    for(const row of candidates.results){
      const shop:ShopContext={id:row.shop_id,name:row.name,slug:row.slug,phone:row.phone,email:row.email,address:row.address,logo_url:row.logo_url,owner_email:row.owner_email,owner_name:row.owner_name,primary_domain:row.primary_domain,timezone:row.timezone,booking_email_enabled:row.booking_email_enabled,owner_notification_enabled:row.owner_notification_enabled,reminder_enabled:row.reminder_enabled,payment_email_enabled:row.payment_email_enabled};
      if(shop.reminder_enabled==="false")continue;
      const appointment=localWallTimeToUtc(row.booking_date,row.start_time,shop.timezone??undefined);
      const delta=appointment.getTime()-now.getTime();if(delta<0||delta>hours*60*60*1000||delta<=Math.max(0,hours-1)*60*60*1000)continue;
      const booking:BookingSummary={...row,shop_id:row.shop_id,status:row.status as BookingSummary["status"],barber_id:"",service_id:"",note:null,created_at:"",updated_at:""};
      const data:TemplateData={template:"booking_reminder",data:this.bookingData(shop,booking,"customer")};
      await this.queue.enqueue(this.job(shop,row.customer_id,row.customer_email,`booking:${row.id}:booking_reminder:customer`,data),"cron");queued++;
    }
    await this.runExpirationNotices(today,now,queued);
    return {processed:candidates.results.length,queued};
  }

  private async runExpirationNotices(today:string,now:Date,initial:number){
    const days=parseDays(this.env.SUBSCRIPTION_EXPIRATION_DAYS);if(!days.length)return initial;
    const max=Math.max(...days);const until=new Date(now.getTime()+(max+1)*86400000).toISOString().slice(0,10);
    const subs=await this.repo.expiringSubscriptions(today,until);let queued=initial;
    for(const sub of subs.results){
      if(!sub.owner_email||sub.payment_email_enabled==="false")continue;
      const remaining=Math.ceil((Date.parse(sub.expired_at)-now.getTime())/86400000);if(!days.includes(remaining))continue;
      const shop=this.repo.shopContext(sub.shop_id);const context=await shop;if(!context)continue;
      const base=this.shopUrl(context);
      const data:TemplateData={template:"subscription_expiring",data:{ownerName:sub.owner_name??"Shop Owner",shopName:sub.shop_name,plan:sub.plan,expiresAt:sub.expired_at,daysRemaining:remaining,billingUrl:base+"/admin/billing",logoUrl:context.logo_url}};
      await this.queue.enqueue(this.job(context,null,sub.owner_email,`subscription:${sub.subscription_id}:expiring:${remaining}`,data),"cron");queued++;
    }
    return queued;
  }

  private bookingData(shop:ShopContext,b:BookingSummary,audience:"customer"|"owner"){
    const base=this.shopUrl(shop);
    return {customerName:b.customer_name,shopName:shop.name,bookingCode:b.booking_code,serviceName:b.service_name,barberName:b.barber_name,bookingDate:b.booking_date,startTime:b.start_time,endTime:b.end_time,totalPrice:b.total_price,currency:this.env.PAYMENT_CURRENCY??"VND",status:b.status,shopPhone:shop.phone,shopEmail:shop.email,shopAddress:shop.address,logoUrl:shop.logo_url,shopUrl:base,bookingUrl:audience==="owner"?`${base}/admin/bookings/${encodeURIComponent(b.id)}`:`${base}/my-bookings`,customerPhone:b.customer_phone,ownerName:shop.owner_name??undefined,audience};
  }
  private job(shop:ShopContext,userId:string|null,recipient:string,key:string,data:TemplateData):EmailJob{return {shopId:shop.id,userId,recipient,notificationKey:key,data};}
  private shopUrl(shop:ShopContext){
    const host=shop.primary_domain??(this.env.PLATFORM_DOMAIN?`${shop.slug}.${this.env.PLATFORM_DOMAIN}`:null);
    if(!host)return "http://localhost:5173";
    const local=host.endsWith(".localhost")||host==="localhost"||host.startsWith("127.");return `${local?"http":"https"}://${host}`;
  }
}

function boundedInteger(raw:string|undefined,fallback:number,min:number,max:number){const n=Number(raw);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;}
function parseDays(raw:string|undefined){return (raw??"7,3,1").split(",").map((value)=>Number(value.trim())).filter((value)=>Number.isInteger(value)&&value>0&&value<=30);}
function localWallTimeToUtc(date:string,time:string,timeZone="Asia/Ho_Chi_Minh"){
  try{new Intl.DateTimeFormat("en",{timeZone}).format();}catch{timeZone="Asia/Ho_Chi_Minh";}
  const [year,month,day]=date.split("-").map(Number),[hour,minute]=time.split(":").map(Number);const desired=Date.UTC(year,month-1,day,hour,minute);let guess=desired;
  for(let i=0;i<4;i++){
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(guess));
    const get=(kind:Intl.DateTimeFormatPartTypes)=>Number(parts.find((part)=>part.type===kind)?.value??0);
    const observed=Date.UTC(get("year"),get("month")-1,get("day"),get("hour"),get("minute"));const diff=desired-observed;if(diff===0)break;guess+=diff;
  }
  return new Date(guess);
}
