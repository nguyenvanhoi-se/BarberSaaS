import type { AuthUser } from "../../shared/auth";

type Page = { page: number; limit: number; search?: string; status?: string };

export class AdminRepository {
  constructor(private readonly db: D1Database) {}

  async audit(shopId: string, userId: string, action: string, entity: string, entityId: string, metadata?: unknown) {
    await this.db.prepare(`INSERT INTO audit_logs (id, shop_id, user_id, action, entity, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), shopId, userId, action, entity, entityId, metadata ? JSON.stringify(metadata) : null).run();
  }

  async dashboard(shopId: string, range: 7 | 30 | 90) {
    const timezoneSetting=await this.db.prepare("SELECT value FROM shop_settings WHERE shop_id=? AND key='timezone' LIMIT 1").bind(shopId).first<{value:string}>();
    let today:string;
    try { const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezoneSetting?.value||"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const get=(name:string)=>parts.find((part)=>part.type===name)?.value??"00";today=`${get("year")}-${get("month")}-${get("day")}`; }
    catch { today=new Date().toISOString().slice(0,10); }
    const month = today.slice(0, 7);
    const [counts, revenue, reviews, recent, schedule, services, barbers, bookingSeries, revenueSeries, revenueByMonth] = await Promise.all([
      this.db.prepare(`SELECT
        SUM(CASE WHEN booking_date = ? THEN 1 ELSE 0 END) today_bookings,
        SUM(CASE WHEN booking_date >= ? AND status IN ('PENDING','CONFIRMED') THEN 1 ELSE 0 END) upcoming_bookings,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) completed_bookings,
        (SELECT COUNT(*) FROM users WHERE shop_id = ? AND role = 'CUSTOMER') total_customers
        FROM bookings WHERE shop_id = ?`).bind(today, today, shopId, shopId).first<Record<string, number>>(),
      this.db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND booking_date = ? THEN total_price ELSE 0 END),0) today_revenue,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND substr(booking_date,1,7) = ? THEN total_price ELSE 0 END),0) month_revenue,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_price ELSE 0 END),0) total_revenue
        FROM bookings WHERE shop_id = ?`).bind(today, month, shopId).first<Record<string, number>>(),
      this.db.prepare(`SELECT COALESCE(AVG(rating),0) average_rating, COUNT(*) total_reviews,
        SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) stars_5, SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) stars_4,
        SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) stars_3, SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) stars_2,
        SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) stars_1 FROM reviews WHERE shop_id=? AND status='APPROVED'`).bind(shopId).first<Record<string, number>>(),
      this.db.prepare(`${this.bookingSummary()} WHERE bk.shop_id=? ORDER BY bk.created_at DESC LIMIT 8`).bind(shopId).all(),
      this.db.prepare(`${this.bookingSummary()} WHERE bk.shop_id=? AND bk.booking_date=? ORDER BY bk.start_time ASC`).bind(shopId, today).all(),
      this.db.prepare(`SELECT sv.id, sv.name, COUNT(bk.id) bookings, COALESCE(SUM(CASE WHEN bk.status='COMPLETED' THEN bk.total_price ELSE 0 END),0) revenue
        FROM services sv LEFT JOIN bookings bk ON bk.shop_id=sv.shop_id AND bk.service_id=sv.id
        WHERE sv.shop_id=? GROUP BY sv.id ORDER BY bookings DESC LIMIT 5`).bind(shopId).all(),
      this.db.prepare(`SELECT ba.id, ba.name, COUNT(bk.id) bookings FROM barbers ba LEFT JOIN bookings bk
        ON bk.shop_id=ba.shop_id AND bk.barber_id=ba.id WHERE ba.shop_id=? GROUP BY ba.id ORDER BY bookings DESC LIMIT 5`).bind(shopId).all(),
      this.db.prepare(`SELECT booking_date day, COUNT(*) value FROM bookings WHERE shop_id=? AND booking_date >= date(?, ?)
        GROUP BY booking_date ORDER BY booking_date`).bind(shopId, today, `-${range - 1} days`).all(),
      this.db.prepare(`SELECT booking_date day, SUM(total_price) value FROM bookings WHERE shop_id=? AND status='COMPLETED' AND booking_date >= date(?, ?)
        GROUP BY booking_date ORDER BY booking_date`).bind(shopId, today, `-${range - 1} days`).all(),
      this.db.prepare(`SELECT substr(booking_date,1,7) month, SUM(total_price) value FROM bookings WHERE shop_id=? AND status='COMPLETED' AND booking_date >= date(?, '-11 months')
        GROUP BY substr(booking_date,1,7) ORDER BY month`).bind(shopId,today).all(),
    ]);
    return { ...(counts ?? {}), ...(revenue ?? {}), ...(reviews ?? {}), recentBookings: recent.results,
      todaySchedule: schedule.results, popularServices: services.results, popularBarbers: barbers.results,
      charts: { bookingsByDay: bookingSeries.results, revenueByDay: revenueSeries.results, revenueByMonth: revenueByMonth.results } };
  }

  async listServices(shopId: string) { return (await this.db.prepare("SELECT id,name,description,price,duration_minutes,image_url,status,created_at FROM services WHERE shop_id=? ORDER BY created_at DESC").bind(shopId).all()).results; }
  service(shopId: string, id: string) { return this.db.prepare("SELECT id FROM services WHERE shop_id=? AND id=?").bind(shopId,id).first(); }
  async saveService(shopId:string,id:string,input:{name:string;description:string|null;price:number;duration_minutes:number;status:"ACTIVE"|"INACTIVE"}, user:AuthUser, create:boolean) {
    const statement=create
      ? this.db.prepare("INSERT INTO services(id,shop_id,name,description,price,duration_minutes,status) VALUES(?,?,?,?,?,?,?)").bind(id,shopId,input.name,input.description,input.price,input.duration_minutes,input.status)
      : this.db.prepare("UPDATE services SET name=?,description=?,price=?,duration_minutes=?,status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=?").bind(input.name,input.description,input.price,input.duration_minutes,input.status,shopId,id);
    await this.db.batch([statement,this.auditStatement(shopId,user.id,create?"CREATE_SERVICE":"UPDATE_SERVICE","service",id)]);
    return this.db.prepare("SELECT id,name,description,price,duration_minutes,image_url,status FROM services WHERE shop_id=? AND id=?").bind(shopId,id).first();
  }
  async deleteService(shopId:string,id:string,user:AuthUser) {
    const result=await this.db.batch([this.db.prepare("UPDATE services SET status='INACTIVE',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=? AND status='ACTIVE'").bind(shopId,id),this.auditOnChange(shopId,user.id,"DELETE_SERVICE","service",id)]);
    return result[0]?.meta.changes===1;
  }

  async listBarbers(shopId:string) { return (await this.db.prepare("SELECT id,name,avatar_url,phone,email,bio,experience_years,specialties,status,created_at FROM barbers WHERE shop_id=? ORDER BY created_at DESC").bind(shopId).all()).results; }
  barber(shopId:string,id:string) { return this.db.prepare("SELECT id FROM barbers WHERE shop_id=? AND id=?").bind(shopId,id).first(); }
  async saveBarber(shopId:string,id:string,input:{name:string;phone:string|null;email:string|null;bio:string|null;experience_years:number;specialties:string[];status:"ACTIVE"|"INACTIVE"}, user:AuthUser, create:boolean) {
    const specialties=JSON.stringify(input.specialties);
    const statement=create
      ? this.db.prepare("INSERT INTO barbers(id,shop_id,name,phone,email,bio,experience_years,specialties,status) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,shopId,input.name,input.phone,input.email,input.bio,input.experience_years,specialties,input.status)
      : this.db.prepare("UPDATE barbers SET name=?,phone=?,email=?,bio=?,experience_years=?,specialties=?,status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=?").bind(input.name,input.phone,input.email,input.bio,input.experience_years,specialties,input.status,shopId,id);
    await this.db.batch([statement,this.auditStatement(shopId,user.id,create?"CREATE_BARBER":"UPDATE_BARBER","barber",id)]);
    return this.db.prepare("SELECT id,name,avatar_url,phone,email,bio,experience_years,specialties,status FROM barbers WHERE shop_id=? AND id=?").bind(shopId,id).first();
  }
  async deleteBarber(shopId:string,id:string,user:AuthUser) {
    const result=await this.db.batch([this.db.prepare("UPDATE barbers SET status='INACTIVE',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=? AND status='ACTIVE'").bind(shopId,id),this.auditOnChange(shopId,user.id,"DELETE_BARBER","barber",id)]);
    return result[0]?.meta.changes===1;
  }
  async workingHours(shopId:string,barberId:string) { return (await this.db.prepare("SELECT day_of_week,start_time,end_time,is_day_off FROM barber_working_hours WHERE shop_id=? AND barber_id=? ORDER BY day_of_week").bind(shopId,barberId).all()).results; }
  async saveWorkingHours(shopId:string,barberId:string,days:{day_of_week:number;start_time:string|null;end_time:string|null;is_day_off:boolean}[]) {
    const statements=days.map((day)=>this.db.prepare(`INSERT INTO barber_working_hours(id,shop_id,barber_id,day_of_week,start_time,end_time,is_day_off)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(barber_id,day_of_week) DO UPDATE SET start_time=excluded.start_time,end_time=excluded.end_time,is_day_off=excluded.is_day_off,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(crypto.randomUUID(),shopId,barberId,day.day_of_week,day.is_day_off?null:day.start_time,day.is_day_off?null:day.end_time,day.is_day_off?1:0));
    await this.db.batch(statements);
    return this.workingHours(shopId,barberId);
  }

  async customers(shopId:string, page:Page) {
    const clauses=["u.shop_id=?","u.role='CUSTOMER'"]; const values:(string|number)[]=[shopId];
    if(page.search){ clauses.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)"); const q=`%${page.search}%`; values.push(q,q,q); }
    const where=clauses.join(" AND ");
    const [rows,count]=await Promise.all([
      this.db.prepare(`SELECT u.id,u.name,u.email,u.phone,u.avatar_url,u.status,COUNT(bk.id) bookings,
        COALESCE(SUM(CASE WHEN bk.status='COMPLETED' THEN bk.total_price ELSE 0 END),0) total_spent,
        MAX(bk.booking_date) last_booking FROM users u LEFT JOIN bookings bk ON bk.customer_id=u.id AND bk.shop_id=u.shop_id
        WHERE ${where} GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).bind(...values,page.limit,(page.page-1)*page.limit).all(),
      this.db.prepare(`SELECT COUNT(*) total FROM users u WHERE ${where}`).bind(...values).first<{total:number}>(),
    ]);
    return {items:rows.results,page:page.page,limit:page.limit,total:count?.total??0};
  }
  async customer(shopId:string,id:string) {
    const [profile,bookings,stats]=await Promise.all([
      this.db.prepare("SELECT id,name,email,phone,avatar_url,status,created_at FROM users WHERE shop_id=? AND role='CUSTOMER' AND id=?").bind(shopId,id).first(),
      this.db.prepare(`${this.bookingSummary()} WHERE bk.shop_id=? AND bk.customer_id=? ORDER BY bk.booking_date DESC,bk.start_time DESC LIMIT 100`).bind(shopId,id).all(),
      this.db.prepare(`SELECT COUNT(*) total_bookings,SUM(status='COMPLETED') completed_bookings,SUM(status='CANCELLED') cancelled_bookings,
        COALESCE(SUM(CASE WHEN status='COMPLETED' THEN total_price ELSE 0 END),0) total_spent FROM bookings WHERE shop_id=? AND customer_id=?`).bind(shopId,id).first(),
    ]);
    return profile ? {profile,bookings:bookings.results,...stats}:null;
  }
  async reviews(shopId:string,page:Page) {
    const clauses=["r.shop_id=?"]; const values:(string|number)[]=[shopId];
    if(page.status){clauses.push("r.status=?");values.push(page.status);}
    return this.paged(`SELECT r.id,r.rating,r.comment,r.status,r.created_at,u.name customer_name,b.name barber_name FROM reviews r
      JOIN users u ON u.id=r.customer_id AND u.shop_id=r.shop_id JOIN barbers b ON b.id=r.barber_id AND b.shop_id=r.shop_id WHERE ${clauses.join(" AND ")}
      ORDER BY r.created_at DESC`,`SELECT COUNT(*) total FROM reviews r WHERE ${clauses.join(" AND ")}`,values,page);
  }
  async updateReview(shopId:string,id:string,status:string,user:AuthUser) {
    const result=await this.db.batch([this.db.prepare("UPDATE reviews SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=?").bind(status,shopId,id),this.auditOnChange(shopId,user.id,"UPDATE_REVIEW","review",id,{status})]);
    return result[0]?.meta.changes===1;
  }
  async deleteReview(shopId:string,id:string,user:AuthUser) {
    const result=await this.db.batch([this.db.prepare("DELETE FROM reviews WHERE shop_id=? AND id=?").bind(shopId,id),this.auditOnChange(shopId,user.id,"DELETE_REVIEW","review",id)]);
    return result[0]?.meta.changes===1;
  }
  async gallery(shopId:string) { return (await this.db.prepare("SELECT id,title,description,image_url,category,sort_order,created_at FROM gallery WHERE shop_id=? ORDER BY sort_order,created_at DESC").bind(shopId).all()).results; }
  galleryItem(shopId:string,id:string) { return this.db.prepare("SELECT id,r2_key FROM gallery WHERE shop_id=? AND id=?").bind(shopId,id).first<{id:string;r2_key:string|null}>(); }
  async addGallery(shopId:string,id:string,key:string,title:string,category:string|null,userId:string) {
    await this.db.batch([this.db.prepare("INSERT INTO gallery(id,shop_id,title,image_url,r2_key,category) VALUES(?,?,?,?,?,?)").bind(id,shopId,title,`/api/public/gallery/${id}/image`,key,category),this.auditStatement(shopId,userId,"UPLOAD_GALLERY","gallery",id)]);
    return this.db.prepare("SELECT id,title,image_url,category,created_at FROM gallery WHERE shop_id=? AND id=?").bind(shopId,id).first();
  }
  async updateGallery(shopId:string,id:string,title:string,category:string|null) {
    const result=await this.db.prepare("UPDATE gallery SET title=?,category=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=?").bind(title,category,shopId,id).run(); return result.meta.changes===1;
  }
  async deleteGallery(shopId:string,id:string,user:AuthUser) {
    const item=await this.galleryItem(shopId,id); if(!item)return null;
    const result=await this.db.batch([this.db.prepare("DELETE FROM gallery WHERE shop_id=? AND id=?").bind(shopId,id),this.auditOnChange(shopId,user.id,"DELETE_GALLERY","gallery",id)]);
    return result[0]?.meta.changes===1 ? item : null;
  }
  async shopSettings(shopId:string) {
    const [shop, settings]=await Promise.all([
      this.db.prepare("SELECT id,name,logo_url,cover_url,phone,email,address,description FROM shops WHERE id=?").bind(shopId).first(),
      this.db.prepare("SELECT key,value FROM shop_settings WHERE shop_id=? ORDER BY key").bind(shopId).all<{key:string;value:string}>(),
    ]);
    return {shop,settings:Object.fromEntries(settings.results.map((row)=>[row.key,row.value]))};
  }
  async saveSettings(shopId:string,user:AuthUser,data:{business:Record<string,string|null>;settings:Record<string,string>}) {
    const b=data.business;
    const statements=[this.db.prepare(`UPDATE shops SET name=?,logo_url=?,cover_url=?,phone=?,email=?,address=?,description=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
      .bind(b.name,b.logo_url,b.cover_url,b.phone,b.email,b.address,b.description,shopId),
    ...Object.entries(data.settings).map(([key,value])=>this.db.prepare(`INSERT INTO shop_settings(id,shop_id,key,value) VALUES(?,?,?,?)
      ON CONFLICT(shop_id,key) DO UPDATE SET value=excluded.value,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(crypto.randomUUID(),shopId,key,value)),
      this.auditStatement(shopId,user.id,"UPDATE_SETTINGS","shop",shopId)];
    await this.db.batch(statements); return this.shopSettings(shopId);
  }
  async profile(userId:string,shopId:string) { return this.db.prepare("SELECT id,name,email,phone,avatar_url,role FROM users WHERE id=? AND shop_id=?").bind(userId,shopId).first(); }
  async saveProfile(userId:string,shopId:string,name:string,phone:string|null) { await this.db.prepare("UPDATE users SET name=?,phone=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND shop_id=?").bind(name,phone,userId,shopId).run();return this.profile(userId,shopId); }
  async passwordHash(userId:string,shopId:string) { return this.db.prepare("SELECT password_hash FROM users WHERE id=? AND shop_id=?").bind(userId,shopId).first<{password_hash:string}>(); }
  async setPassword(userId:string,shopId:string,passwordHash:string,sessionId:string) {
    await this.db.batch([this.db.prepare("UPDATE users SET password_hash=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND shop_id=?").bind(passwordHash,userId,shopId),this.db.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").bind(userId,sessionId)]);
  }
  private auditStatement(shopId:string,userId:string,action:string,entity:string,entityId:string,metadata?:unknown) { return this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),shopId,userId,action,entity,entityId,metadata?JSON.stringify(metadata):null); }
  private auditOnChange(shopId:string,userId:string,action:string,entity:string,entityId:string,metadata?:unknown) { return this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) SELECT ?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),shopId,userId,action,entity,entityId,metadata?JSON.stringify(metadata):null); }
  private async paged(query:string,countQuery:string,values:(string|number)[],page:Page) {
    const [rows,count]=await Promise.all([this.db.prepare(`${query} LIMIT ? OFFSET ?`).bind(...values,page.limit,(page.page-1)*page.limit).all(),this.db.prepare(countQuery).bind(...values).first<{total:number}>()]);
    return {items:rows.results,page:page.page,limit:page.limit,total:count?.total??0};
  }
  private bookingSummary() { return `SELECT bk.id,bk.booking_code,bk.customer_id,u.name customer_name,u.email customer_email,u.phone customer_phone,bk.service_id,sv.name service_name,bk.barber_id,ba.name barber_name,bk.booking_date,bk.start_time,bk.end_time,sv.duration_minutes,bk.total_price,bk.note,bk.status,bk.created_at FROM bookings bk JOIN users u ON u.id=bk.customer_id AND u.shop_id=bk.shop_id JOIN services sv ON sv.id=bk.service_id AND sv.shop_id=bk.shop_id JOIN barbers ba ON ba.id=bk.barber_id AND ba.shop_id=bk.shop_id`; }
}
