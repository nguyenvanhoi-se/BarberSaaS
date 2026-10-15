import type { D1Database } from "@cloudflare/workers-types";
import { AppError } from "../utils/app-error";
import { PLAN_CATALOG, type FeatureName, type PlanId, type PlanLimits } from "./plan-catalog";

export type SubscriptionStatus="TRIAL"|"ACTIVE"|"EXPIRED"|"CANCELLED"|"PAST_DUE";
export type CurrentSubscription={id:string;shop_id:string;plan:PlanId;status:SubscriptionStatus;started_at:string;expired_at:string|null;trial_started_at:string|null;trial_expired_at:string|null;billing_interval:"MONTHLY"|"YEARLY";cancel_at_period_end:boolean;scheduled_plan:PlanId|null;scheduled_billing_interval:"MONTHLY"|"YEARLY"|null;created_at:string;updated_at:string};
export type Usage={barbers:{used:number;limit:number|null};services:{used:number;limit:number|null};gallery:{used:number;limit:number|null};customers:{used:number;limit:number|null};bookings_this_month:{used:number;limit:number|null}};
const PLAN_CODES=Object.keys(PLAN_CATALOG) as PlanId[];
export const isPlanId=(value:unknown):value is PlanId=>typeof value==="string"&&PLAN_CODES.includes(value as PlanId);
const effectiveStatus=(subscription:CurrentSubscription,now=Date.now()):SubscriptionStatus=>{
  const expiry=subscription.status==="TRIAL"?(subscription.trial_expired_at??subscription.expired_at):subscription.expired_at;
  if((expiry&&Date.parse(expiry)<=now)||subscription.status==="EXPIRED")return "EXPIRED";
  return subscription.status;
};

export class PlanService {
  constructor(private readonly db:D1Database){}
  getPlan(code:PlanId){return PLAN_CATALOG[code];}
  getPlanLimits(code:PlanId):PlanLimits{return PLAN_CATALOG[code].limits;}
  hasFeature(code:PlanId,feature:FeatureName){return PLAN_CATALOG[code].features[feature];}

  async getCurrentSubscription(shopId:string):Promise<CurrentSubscription|null>{
    const row=await this.db.prepare(`SELECT id,shop_id,plan,status,started_at,expired_at,trial_started_at,trial_expired_at,billing_interval,cancel_at_period_end,scheduled_plan,scheduled_billing_interval,created_at,updated_at
      FROM subscriptions WHERE shop_id=? ORDER BY created_at DESC,id DESC LIMIT 1`).bind(shopId).first<Omit<CurrentSubscription,"status"|"plan">&{status:string;plan:string}>();
    if(!row||!isPlanId(row.plan))return null;
    return {...row,plan:row.plan,status:row.status==="TRIALING"?"TRIAL":row.status as SubscriptionStatus,cancel_at_period_end:Boolean(row.cancel_at_period_end),scheduled_plan:row.scheduled_plan&&isPlanId(row.scheduled_plan)?row.scheduled_plan:null};
  }
  async getCurrentPlan(shopId:string):Promise<PlanId>{
    const subscription=await this.getCurrentSubscription(shopId);
    if(!subscription)throw new AppError(402,"SUBSCRIPTION_REQUIRED","This shop does not have a subscription.");
    const status=effectiveStatus(subscription);
    // Expiry removes paid features but keeps data and falls back to the non-destructive BASIC tier.
    return status==="ACTIVE"||status==="TRIAL"?subscription.plan:"BASIC";
  }
  isSubscriptionActive(subscription:CurrentSubscription|null,now=Date.now()):boolean{
    if(!subscription)return false;const status=effectiveStatus(subscription,now);return status==="ACTIVE"||status==="TRIAL";
  }
  async getUsage(shopId:string):Promise<Usage>{
    const [subscription,counts]=await Promise.all([
      this.getCurrentSubscription(shopId),
      this.db.prepare(`SELECT
        (SELECT COUNT(*) FROM barbers WHERE shop_id=? AND status='ACTIVE') barbers,
        (SELECT COUNT(*) FROM services WHERE shop_id=? AND status='ACTIVE') services,
        (SELECT COUNT(*) FROM gallery WHERE shop_id=?) gallery,
        (SELECT COUNT(*) FROM users WHERE shop_id=? AND role='CUSTOMER' AND status='ACTIVE') customers,
        (SELECT COUNT(*) FROM bookings WHERE shop_id=? AND created_at>=date('now','start of month') AND created_at<date('now','start of month','+1 month') AND status<>'CANCELLED') bookings`)
        .bind(shopId,shopId,shopId,shopId,shopId).first<{barbers:number;services:number;gallery:number;customers:number;bookings:number}>(),
    ]);
    if(!subscription)throw new AppError(402,"SUBSCRIPTION_REQUIRED","This shop does not have a subscription.");
    const status=effectiveStatus(subscription),plan=status==="ACTIVE"||status==="TRIAL"?subscription.plan:"BASIC";const limits=this.getPlanLimits(plan);const row=counts??{barbers:0,services:0,gallery:0,customers:0,bookings:0};
    return {barbers:{used:row.barbers,limit:limits.maxBarbers},services:{used:row.services,limit:limits.maxServices},gallery:{used:row.gallery,limit:limits.maxGalleryImages},customers:{used:row.customers,limit:limits.maxCustomers},bookings_this_month:{used:row.bookings,limit:limits.maxBookingsPerMonth}};
  }
  async getBilling(shopId:string){
    const subscription=await this.getCurrentSubscription(shopId);if(!subscription)throw new AppError(402,"SUBSCRIPTION_REQUIRED","This shop does not have a subscription.");
    const status=effectiveStatus(subscription);const effectivePlan=status==="ACTIVE"||status==="TRIAL"?subscription.plan:"BASIC";
    return {...subscription,status,assigned_plan:subscription.plan,effective_plan:effectivePlan,plan_details:this.getPlan(effectivePlan),is_active:this.isSubscriptionActive(subscription)};
  }
  async getRemainingLimit(shopId:string,resource:"barbers"|"services"|"gallery"|"customers"|"bookings_this_month"){
    const usage=await this.getUsage(shopId);const item=usage[resource];return item.limit===null?null:Math.max(0,item.limit-item.used);
  }
  async assertCanCreate(shopId:string,resource:"barbers"|"services"|"gallery"|"bookings_this_month"){
    const usage=await this.getUsage(shopId);const item=usage[resource];if(item.limit!==null&&item.used>=item.limit){const label=resource==="barbers"?"barber":resource==="services"?"service":resource==="gallery"?"gallery image":"booking";throw new AppError(403,"PLAN_LIMIT_REACHED",`You have reached the ${label} limit for your current plan.`,[{code:"PLAN_LIMIT_REACHED",message:`Upgrade your plan to add more ${label}s.`}]);}
  }
  async monthlyBookingLimit(shopId:string):Promise<number|null>{const plan=await this.getCurrentPlan(shopId);return this.getPlanLimits(plan).maxBookingsPerMonth;}
  async assertBookingMonthWithinLimit(shopId:string){
    const limit=await this.monthlyBookingLimit(shopId);if(limit===null)return;
    const now=new Date(),monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString().slice(0,10),monthEnd=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString().slice(0,10);
    const row=await this.db.prepare("SELECT COUNT(*) used FROM bookings WHERE shop_id=? AND created_at>=? AND created_at<? AND status<>'CANCELLED'").bind(shopId,monthStart,monthEnd).first<{used:number}>();
    if((row?.used??0)>=limit)throw new AppError(403,"PLAN_LIMIT_REACHED","You have reached the monthly booking limit for your current plan.");
  }
  async canUseCustomDomain(shopId:string){const plan=await this.getCurrentPlan(shopId);return this.hasFeature(plan,"custom_domain");}
  async requireFeature(shopId:string,feature:FeatureName){
    const subscription=await this.getCurrentSubscription(shopId);if(!subscription)throw new AppError(402,"SUBSCRIPTION_REQUIRED","This shop does not have a subscription.");
    if(!this.isSubscriptionActive(subscription))throw new AppError(403,"SUBSCRIPTION_EXPIRED","This subscription is no longer active.");
    const plan=await this.getCurrentPlan(shopId);if(!this.hasFeature(plan,feature))throw new AppError(403,"FEATURE_NOT_AVAILABLE","This feature is not available on your current plan.");return plan;
  }
}
