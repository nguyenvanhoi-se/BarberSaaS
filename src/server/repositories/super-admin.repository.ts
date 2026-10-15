import type { PlanId } from "../services/plan-catalog";

type PageQuery = { page: number; limit: number; search?: string };
type ShopFilters = PageQuery & { status?: string };
type UserFilters = PageQuery & { role?: string; shop_id?: string; status?: string };
type SubscriptionFilters = PageQuery & { status?: string; plan?: string; shop_id?: string };
type AuditFilters = PageQuery & { user_id?: string; shop_id?: string; action?: string; date_from?: string; date_to?: string };

function safeMetadata(value: unknown): unknown {
  const forbidden = /(password|token|secret|credential|authorization|cookie|hash)/iu;
  if (Array.isArray(value)) return value.slice(0, 100).map(safeMetadata);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, forbidden.test(key) ? "[REDACTED]" : safeMetadata(item)]));
  }
  if (typeof value === "string") return value.slice(0, 2000);
  return value;
}

export class SuperAdminRepository {
  constructor(private readonly db: D1Database) {}

  async audit(shopId: string | null, userId: string, action: string, entity: string, entityId: string | null, metadata?: unknown) {
    const safe = metadata === undefined ? null : JSON.stringify(safeMetadata(metadata));
    await this.db.prepare(`INSERT INTO audit_logs (id,shop_id,user_id,action,entity,entity_id,metadata)
      VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), shopId, userId, action, entity, entityId, safe).run();
  }

  async dashboard() {
    const [shops, users, bookings, subscriptions] = await Promise.all([
      this.db.prepare(`SELECT COUNT(*) total_shops,
        COALESCE(SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END),0) active_shops,
        COALESCE(SUM(CASE WHEN status='SUSPENDED' THEN 1 ELSE 0 END),0) suspended_shops,
        COALESCE(SUM(CASE WHEN status='INACTIVE' THEN 1 ELSE 0 END),0) inactive_shops FROM shops`).first<Record<string, number>>(),
      this.db.prepare(`SELECT COUNT(*) total_users,
        COALESCE(SUM(CASE WHEN role='CUSTOMER' THEN 1 ELSE 0 END),0) total_customers,
        (SELECT COUNT(*) FROM barbers) total_barbers FROM users`).first<Record<string, number>>(),
      this.db.prepare(`SELECT COUNT(*) total_bookings,
        COALESCE(SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END),0) completed_bookings,
        COALESCE(SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END),0) cancelled_bookings,
        COALESCE(SUM(CASE WHEN status='COMPLETED' THEN total_price ELSE 0 END),0) total_revenue FROM bookings`).first<Record<string, number>>(),
      this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END),0) active_subscriptions,
        COALESCE(SUM(CASE WHEN status='EXPIRED' OR (expired_at IS NOT NULL AND expired_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN 1 ELSE 0 END),0) expired_subscriptions
        FROM subscriptions`).first<Record<string, number>>(),
    ]);
    return { ...shops, ...users, ...bookings, ...subscriptions, mrr: null };
  }

  async statistics(days: 7 | 30 | 90 | 365) {
    const interval = days === 365 ? "-11 months" : `-${days - 1} days`;
    const shopBucket=days===365?"strftime('%Y-%m',created_at)":"date(created_at)";
    const bookingBucket=days===365?"strftime('%Y-%m',booking_date)":"booking_date";
    const [shops, bookings, revenue, users, tenants] = await Promise.all([
      this.db.prepare(`SELECT ${shopBucket} AS period,COUNT(*) AS value FROM shops WHERE created_at>=date('now',?) GROUP BY ${shopBucket} ORDER BY period`).bind(interval).all(),
      this.db.prepare(`SELECT ${bookingBucket} AS period,COUNT(*) AS value FROM bookings WHERE booking_date>=date('now',?) GROUP BY ${bookingBucket} ORDER BY period`).bind(interval).all(),
      this.db.prepare(`SELECT ${bookingBucket} AS period,SUM(total_price) AS value FROM bookings WHERE status='COMPLETED' AND booking_date>=date('now',?) GROUP BY ${bookingBucket} ORDER BY period`).bind(interval).all(),
      this.db.prepare(`SELECT ${shopBucket} AS period,COUNT(*) AS value FROM users WHERE created_at>=date('now',?) GROUP BY ${shopBucket} ORDER BY period`).bind(interval).all(),
      this.db.prepare(`SELECT ${shopBucket} AS period,COUNT(*) AS value FROM shops WHERE status='ACTIVE' AND created_at>=date('now',?) GROUP BY ${shopBucket} ORDER BY period`).bind(interval).all(),
    ]);
    return { range_days: days, shops_growth: shops.results, bookings_growth: bookings.results, revenue_growth: revenue.results, new_users: users.results, active_tenants: tenants.results };
  }

  async shops(filters: ShopFilters) {
    const { where, values } = this.shopWhere(filters);
    return this.paginated(`SELECT s.id,s.name,s.slug,(SELECT sd.hostname FROM shop_domains sd WHERE sd.shop_id=s.id AND sd.type='CUSTOM_DOMAIN' AND sd.status<>'DISABLED' ORDER BY sd.created_at DESC LIMIT 1) domain,s.plan,s.status,s.created_at,
      owner.name AS owner_name,owner.email AS owner_email,
      (SELECT sub.status FROM subscriptions sub WHERE sub.shop_id=s.id ORDER BY sub.created_at DESC LIMIT 1) subscription_status
      FROM shops s LEFT JOIN users owner ON owner.id=(SELECT u.id FROM users u WHERE u.shop_id=s.id AND u.role='SHOP_OWNER' ORDER BY u.created_at LIMIT 1)
      ${where} ORDER BY s.created_at DESC`, `SELECT COUNT(*) total FROM shops s
      LEFT JOIN users owner ON owner.id=(SELECT u.id FROM users u WHERE u.shop_id=s.id AND u.role='SHOP_OWNER' ORDER BY u.created_at LIMIT 1) ${where}`, values, filters);
  }

  async shop(id: string) {
    return this.db.prepare(`SELECT s.id,s.name,s.slug,(SELECT sd.hostname FROM shop_domains sd WHERE sd.shop_id=s.id AND sd.type='CUSTOM_DOMAIN' AND sd.status<>'DISABLED' ORDER BY sd.created_at DESC LIMIT 1) domain,s.logo_url,s.phone,s.email,s.address,s.description,s.status,s.plan,s.created_at,s.updated_at,
      owner.id owner_id,owner.name owner_name,owner.email owner_email,owner.phone owner_phone,owner.status owner_status,
      (SELECT sub.id FROM subscriptions sub WHERE sub.shop_id=s.id ORDER BY sub.created_at DESC LIMIT 1) subscription_id,
      (SELECT sub.status FROM subscriptions sub WHERE sub.shop_id=s.id ORDER BY sub.created_at DESC LIMIT 1) subscription_status
      FROM shops s LEFT JOIN users owner ON owner.id=(SELECT u.id FROM users u WHERE u.shop_id=s.id AND u.role='SHOP_OWNER' ORDER BY u.created_at LIMIT 1)
      WHERE s.id=? LIMIT 1`).bind(id).first<Record<string, unknown>>();
  }

  async shopStatistics(shopId: string) {
    const [summary, popular] = await Promise.all([
      this.db.prepare(`SELECT
        (SELECT COUNT(*) FROM bookings WHERE shop_id=?) bookings,
        (SELECT SUM(status='COMPLETED') FROM bookings WHERE shop_id=?) completed_bookings,
        (SELECT SUM(status='CANCELLED') FROM bookings WHERE shop_id=?) cancelled_bookings,
        (SELECT COUNT(*) FROM users WHERE shop_id=? AND role='CUSTOMER') customers,
        (SELECT COUNT(*) FROM barbers WHERE shop_id=?) barbers,
        (SELECT COUNT(*) FROM services WHERE shop_id=?) services,
        (SELECT COUNT(*) FROM reviews WHERE shop_id=?) reviews,
        (SELECT COALESCE(AVG(rating),0) FROM reviews WHERE shop_id=? AND status='APPROVED') average_rating,
        (SELECT COALESCE(SUM(total_price),0) FROM bookings WHERE shop_id=? AND status='COMPLETED') revenue`)
        .bind(shopId,shopId,shopId,shopId,shopId,shopId,shopId,shopId,shopId).first<Record<string, number>>(),
      this.db.prepare(`SELECT sv.id,sv.name,COUNT(bk.id) bookings FROM services sv LEFT JOIN bookings bk
        ON bk.shop_id=sv.shop_id AND bk.service_id=sv.id WHERE sv.shop_id=? GROUP BY sv.id ORDER BY bookings DESC LIMIT 5`).bind(shopId).all(),
    ]);
    return { ...summary, popular_services: popular.results };
  }

  async createShop(input: { shopId:string; ownerId:string; subscriptionId:string; inviteId:string; name:string; slug:string; domain:string|null; plan:PlanId; ownerName:string; ownerEmail:string; ownerPhone:string|null; ownerPasswordHash:string; tokenHash:string; inviteExpiry:string; superAdminId:string; startedAt:string; expiredAt:string }) {
    const settingRows = [
      ["business_name",input.name], ["opening_hours","{}"], ["timezone","Asia/Ho_Chi_Minh"],
      ["booking_email_enabled","true"],["owner_notification_enabled","true"],["reminder_enabled","true"],["payment_email_enabled","true"],
    ] as const;
    const commands = [
      this.db.prepare("INSERT INTO shops(id,name,slug,domain,plan,status) VALUES(?,?,?,NULL,?,'ACTIVE')").bind(input.shopId,input.name,input.slug,input.plan),
      this.db.prepare(`INSERT INTO users(id,shop_id,name,email,phone,password_hash,role,status)
        VALUES(?,?,?,?,? ,?,'SHOP_OWNER','ACTIVE')`).bind(input.ownerId,input.shopId,input.ownerName,input.ownerEmail,input.ownerPhone,input.ownerPasswordHash),
      ...settingRows.map(([key,value])=>this.db.prepare("INSERT INTO shop_settings(id,shop_id,key,value) VALUES(?,?,?,?)").bind(crypto.randomUUID(),input.shopId,key,value)),
      this.db.prepare("INSERT INTO subscriptions(id,shop_id,plan,status,started_at,expired_at,trial_started_at,trial_expired_at,billing_interval) VALUES(?,?,?,'TRIALING',?,?,?,?,'MONTHLY')").bind(input.subscriptionId,input.shopId,input.plan,input.startedAt,input.expiredAt,input.startedAt,input.expiredAt),
      this.db.prepare("INSERT INTO owner_invites(id,shop_id,user_id,token_hash,expires_at,created_by) VALUES(?,?,?,?,?,?)").bind(input.inviteId,input.shopId,input.ownerId,input.tokenHash,input.inviteExpiry,input.superAdminId),
      this.auditStatement(null,input.superAdminId,"CREATE_SHOP","shop",input.shopId,{slug:input.slug,plan:input.plan,owner_id:input.ownerId}),
    ];
    await this.db.batch(commands);
  }

  async updateShop(id:string,input:{name:string;slug:string;domain:string|null;plan:PlanId},userId:string) {
    const current=await this.shop(id);if(!current)return null;
    const currentSubscription=await this.db.prepare("SELECT id,plan,status,expired_at FROM subscriptions WHERE shop_id=? ORDER BY created_at DESC LIMIT 1").bind(id).first<{id:string;plan:string;status:string;expired_at:string|null}>();
    const changedPlan=currentSubscription?.plan!==input.plan;
    const statements=[this.db.prepare(`UPDATE shops SET name=?,slug=?,plan=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(input.name,input.slug,input.plan,id),
      this.auditStatement(null,userId,"UPDATE_SHOP","shop",id,{name:input.name,slug:input.slug}),
      ...(changedPlan&&currentSubscription?[this.db.prepare(`UPDATE subscriptions SET plan=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(input.plan,currentSubscription.id),this.auditStatement(id,userId,"PLAN_CHANGED","subscription",currentSubscription.id,{old_plan:currentSubscription.plan,new_plan:input.plan,old_status:currentSubscription.status,new_status:currentSubscription.status,old_expiration:currentSubscription.expired_at,new_expiration:currentSubscription.expired_at})]:[])];
    await this.db.batch(statements);return this.shop(id);
  }

  async setShopStatus(id:string,status:"ACTIVE"|"SUSPENDED"|"INACTIVE",userId:string,action:string) {
    const result=await this.db.batch([this.db.prepare("UPDATE shops SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status<>?").bind(status,id,status),
      this.auditOnChange(null,userId,action,"shop",id,{status})]);
    return result[0]?.meta.changes===1;
  }

  async users(filters:UserFilters) {
    const clauses:string[]=[];const values:(string|number)[]=[];
    if(filters.search){clauses.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)");const q=`%${filters.search.replaceAll("%","\\%").replaceAll("_","\\_")}%`;values.push(q,q,q);}
    if(filters.role){clauses.push("u.role=?");values.push(filters.role);}
    if(filters.shop_id){clauses.push("u.shop_id=?");values.push(filters.shop_id);}
    if(filters.status){clauses.push("u.status=?");values.push(filters.status);}
    const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
    return this.paginated(`SELECT u.id,u.name,u.email,u.phone,u.role,u.shop_id,u.status,u.created_at,s.name shop_name
      FROM users u LEFT JOIN shops s ON s.id=u.shop_id ${where} ORDER BY u.created_at DESC`,
      `SELECT COUNT(*) total FROM users u LEFT JOIN shops s ON s.id=u.shop_id ${where}`,values,filters);
  }

  async user(id:string) {
    const profile=await this.db.prepare(`SELECT u.id,u.name,u.email,u.phone,u.avatar_url,u.role,u.shop_id,u.status,u.created_at,s.name shop_name,s.slug shop_slug
      FROM users u LEFT JOIN shops s ON s.id=u.shop_id WHERE u.id=? LIMIT 1`).bind(id).first<Record<string,unknown>&{role:string;shop_id:string|null}>();
    if(!profile)return null;
    if(profile.role==="CUSTOMER"){
      const stats=await this.db.prepare(`SELECT COUNT(*) bookings,SUM(status='COMPLETED') completed_bookings,SUM(status='CANCELLED') cancelled_bookings,
        COALESCE(SUM(CASE WHEN status='COMPLETED' THEN total_price ELSE 0 END),0) total_spent FROM bookings WHERE customer_id=? AND shop_id IS ?`).bind(id,profile.shop_id).first();
      return {...profile,statistics:stats};
    }
    if(profile.role==="BARBER"){
      const barber=await this.db.prepare(`SELECT b.id,b.name,b.experience_years,b.specialties,b.status FROM barber_user_links l JOIN barbers b ON b.id=l.barber_id AND b.shop_id=l.shop_id WHERE l.user_id=? AND l.shop_id IS ? LIMIT 1`).bind(id,profile.shop_id).first();
      return {...profile,barber};
    }
    return profile;
  }

  async setUserStatus(id:string,status:"ACTIVE"|"SUSPENDED"|"INACTIVE",actorId:string) {
    const user=await this.db.prepare("SELECT id,role,status FROM users WHERE id=?").bind(id).first<{id:string;role:string;status:string}>();if(!user)return false;
    if(user.status===status)return false;
    if(user.role==="SUPER_ADMIN"&&status!=="ACTIVE"&&id===actorId)throw new Error("LAST_SUPER_ADMIN");
    const action=status==="ACTIVE"?"ACTIVATE_USER":"SUSPEND_USER";
    const keepSuperAdmin=user.role==="SUPER_ADMIN"&&status!=="ACTIVE"?" AND EXISTS (SELECT 1 FROM users active WHERE active.role='SUPER_ADMIN' AND active.status='ACTIVE' AND active.id<>users.id)":"";
    const result=await this.db.batch([this.db.prepare(`UPDATE users SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status<>?${keepSuperAdmin}`).bind(status,id,status),this.auditOnChange(user.role==="SUPER_ADMIN"?null:(await this.userShop(id)),actorId,action,"user",id,{role:user.role,status})]);
    if(user.role==="SUPER_ADMIN"&&status!=="ACTIVE"&&result[0]?.meta.changes!==1)throw new Error("LAST_SUPER_ADMIN");
    return result[0]?.meta.changes===1;
  }

  async userShop(id:string){const row=await this.db.prepare("SELECT shop_id FROM users WHERE id=?").bind(id).first<{shop_id:string|null}>();return row?.shop_id??null;}

  async subscriptions(filters:SubscriptionFilters) {
    const clauses:string[]=[];const values:(string|number)[]=[];
    if(filters.search){clauses.push("(s.name LIKE ? OR s.slug LIKE ?)");const q=`%${filters.search}%`;values.push(q,q);}
    if(filters.status){clauses.push("sub.status=?");values.push(filters.status);}
    if(filters.plan){clauses.push("sub.plan=?");values.push(filters.plan);}
    if(filters.shop_id){clauses.push("sub.shop_id=?");values.push(filters.shop_id);}
    const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
    return this.paginated(`SELECT sub.id,sub.shop_id,s.name shop_name,s.slug,sub.plan,sub.status,sub.billing_interval,sub.trial_started_at,sub.trial_expired_at,sub.started_at,sub.expired_at,sub.created_at
      FROM subscriptions sub JOIN shops s ON s.id=sub.shop_id ${where} ORDER BY sub.created_at DESC`,
      `SELECT COUNT(*) total FROM subscriptions sub JOIN shops s ON s.id=sub.shop_id ${where}`,values,filters);
  }
  subscription(id:string){return this.db.prepare(`SELECT sub.id,sub.shop_id,s.name shop_name,sub.plan,sub.status,sub.started_at,sub.expired_at,sub.trial_started_at,sub.trial_expired_at,sub.billing_interval,sub.created_at,sub.updated_at
    FROM subscriptions sub JOIN shops s ON s.id=sub.shop_id WHERE sub.id=? LIMIT 1`).bind(id).first<Record<string,unknown>&{shop_id:string;plan:string}>();}
  async updateSubscription(id:string,input:{plan:PlanId;status:"TRIALING"|"ACTIVE"|"PAST_DUE"|"CANCELLED"|"EXPIRED";expired_at:string|null;billing_interval:"MONTHLY"|"YEARLY"},userId:string){
    const current=await this.subscription(id);if(!current)return false;
    await this.db.batch([this.db.prepare("UPDATE subscriptions SET plan=?,status=?,expired_at=?,billing_interval=?,trial_started_at=CASE WHEN ?='TRIALING' THEN COALESCE(trial_started_at,started_at) ELSE trial_started_at END,trial_expired_at=CASE WHEN ?='TRIALING' THEN ? ELSE trial_expired_at END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(input.plan,input.status,input.expired_at,input.billing_interval,input.status,input.status,input.expired_at,id),
      this.db.prepare("UPDATE shops SET plan=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(input.plan,current.shop_id),
      this.auditStatement(current.shop_id,userId,"PLAN_CHANGED","subscription",id,{old_plan:current.plan,new_plan:input.plan,old_status:current.status,new_status:input.status,old_expiration:current.expired_at,new_expiration:input.expired_at,billing_interval:input.billing_interval})]);return true;
  }

  async auditLogs(filters:AuditFilters) {
    const clauses:string[]=[];const values:(string|number)[]=[];
    if(filters.search){clauses.push("(a.action LIKE ? OR a.entity LIKE ? OR a.entity_id LIKE ? OR u.name LIKE ? OR s.name LIKE ?)");const q=`%${filters.search}%`;values.push(q,q,q,q,q);}
    if(filters.user_id){clauses.push("a.user_id=?");values.push(filters.user_id);}
    if(filters.shop_id){clauses.push("a.shop_id=?");values.push(filters.shop_id);}
    if(filters.action){clauses.push("a.action=?");values.push(filters.action);}
    if(filters.date_from){clauses.push("date(a.created_at)>=date(?)");values.push(filters.date_from);}
    if(filters.date_to){clauses.push("date(a.created_at)<=date(?)");values.push(filters.date_to);}
    const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
    const result=await this.paginated(`SELECT a.id,a.shop_id,s.name shop_name,a.user_id,u.name user_name,a.action,a.entity,a.entity_id,a.metadata,a.created_at
      FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN shops s ON s.id=a.shop_id ${where} ORDER BY a.created_at DESC`,
      `SELECT COUNT(*) total FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN shops s ON s.id=a.shop_id ${where}`,values,filters);
    return {...result,items:result.items.map((item)=>({...item,metadata:this.redactMetadata(item.metadata)}))};
  }

  async superAdminProfile(id:string){return this.db.prepare("SELECT id,name,email,phone,avatar_url,role,created_at FROM users WHERE id=? AND role='SUPER_ADMIN' AND shop_id IS NULL").bind(id).first();}
  async userPassword(id:string){return this.db.prepare("SELECT password_hash FROM users WHERE id=? AND role='SUPER_ADMIN' AND shop_id IS NULL").bind(id).first<{password_hash:string}>();}
  async updateSuperAdminProfile(id:string,name:string,phone:string|null){await this.db.prepare("UPDATE users SET name=?,phone=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND role='SUPER_ADMIN' AND shop_id IS NULL").bind(name,phone,id).run();return this.superAdminProfile(id);}
  async changeSuperAdminPassword(id:string,passwordHash:string,sessionId:string){await this.db.batch([this.db.prepare("UPDATE users SET password_hash=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND role='SUPER_ADMIN' AND shop_id IS NULL").bind(passwordHash,id),this.db.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").bind(id,sessionId)]);}

  private async paginated(query:string,countQuery:string,values:(string|number)[],page:PageQuery){
    const [rows,count]=await Promise.all([this.db.prepare(`${query} LIMIT ? OFFSET ?`).bind(...values,page.limit,(page.page-1)*page.limit).all<Record<string,unknown>>(),this.db.prepare(countQuery).bind(...values).first<{total:number}>()]);
    return {items:rows.results,total:count?.total??0,page:page.page,limit:page.limit};
  }
  private shopWhere(filters:ShopFilters){const clauses:string[]=[];const values:(string|number)[]=[];if(filters.status){clauses.push("s.status=?");values.push(filters.status);}if(filters.search){clauses.push("(s.name LIKE ? OR s.slug LIKE ? OR EXISTS(SELECT 1 FROM shop_domains sd WHERE sd.shop_id=s.id AND sd.hostname LIKE ?) OR owner.email LIKE ?)");const q=`%${filters.search.replaceAll("%","\\%").replaceAll("_","\\_")}%`;values.push(q,q,q,q);}return {where:clauses.length?`WHERE ${clauses.join(" AND ")}`:"",values};}
  private auditStatement(shopId:string|null,userId:string,action:string,entity:string,entityId:string|null,metadata?:unknown){const safe=metadata===undefined?null:JSON.stringify(safeMetadata(metadata));return this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),shopId,userId,action,entity,entityId,safe);}
  private auditOnChange(shopId:string|null,userId:string,action:string,entity:string,entityId:string|null,metadata?:unknown){const safe=metadata===undefined?null:JSON.stringify(safeMetadata(metadata));return this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) SELECT ?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),shopId,userId,action,entity,entityId,safe);}
  private redactMetadata(raw:unknown):unknown{if(typeof raw!=="string")return raw;try{return safeMetadata(JSON.parse(raw));}catch{return "[INVALID METADATA]";}}
}
