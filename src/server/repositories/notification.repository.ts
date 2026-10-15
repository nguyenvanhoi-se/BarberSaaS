import type { EmailTemplateName } from "../notifications/email-templates";

export type NotificationShopContext = {
  id: string; name: string; slug: string; phone: string | null; email: string | null; address: string | null;
  logo_url: string | null; owner_email: string | null; owner_name: string | null; primary_domain: string | null;
  timezone: string | null;
  booking_email_enabled: string | null; owner_notification_enabled: string | null;
  reminder_enabled: string | null; payment_email_enabled: string | null;
};

export class NotificationRepository {
  constructor(private readonly db: D1Database) {}

  async shopContext(shopId: string): Promise<NotificationShopContext | null> {
    return this.db.prepare(`SELECT s.id,s.name,s.slug,s.phone,s.email,
      COALESCE((SELECT value FROM shop_settings WHERE shop_id=s.id AND key='address'),s.address) address,
      COALESCE((SELECT value FROM shop_settings WHERE shop_id=s.id AND key='logo'),s.logo_url) logo_url,
      (SELECT email FROM users WHERE shop_id=s.id AND role='SHOP_OWNER' AND status='ACTIVE' ORDER BY created_at,id LIMIT 1) owner_email,
      (SELECT name FROM users WHERE shop_id=s.id AND role='SHOP_OWNER' AND status='ACTIVE' ORDER BY created_at,id LIMIT 1) owner_name,
      (SELECT hostname FROM shop_domains WHERE shop_id=s.id AND is_primary=1 AND status='ACTIVE' AND ssl_status='ACTIVE' LIMIT 1) primary_domain,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='timezone') timezone,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='booking_email_enabled') booking_email_enabled,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='owner_notification_enabled') owner_notification_enabled,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='reminder_enabled') reminder_enabled,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='payment_email_enabled') payment_email_enabled
      FROM shops s WHERE s.id=? LIMIT 1`).bind(shopId).first<NotificationShopContext>();
  }

  async claim(input: { id: string; shopId: string | null; userId: string | null; recipient: string; recipientHash: string; template: EmailTemplateName; key: string; provider: string }) {
    const result = await this.db.prepare(`INSERT INTO email_logs(id,shop_id,user_id,recipient,recipient_hash,template,notification_key,status,provider,attempts)
      VALUES(?,?,?,?,?,?,?,'SENDING',?,0) ON CONFLICT(notification_key) DO NOTHING`)
      .bind(input.id,input.shopId,input.userId,input.recipient,input.recipientHash,input.template,input.key,input.provider).run();
    return result.meta.changes === 1;
  }

  finish(key: string, update: { status: "SENT" | "FAILED" | "RETRYABLE_FAILED"; errorCode?: string; messageId?: string; attempts: number; sentAt?: string }) {
    return this.db.prepare(`UPDATE email_logs SET status=?,error_code=?,provider_message_id=?,attempts=?,sent_at=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE notification_key=? AND status='SENDING'`)
      .bind(update.status,update.errorCode??null,update.messageId??null,update.attempts,update.sentAt??null,key).run();
  }

  async settings(shopId: string) {
    const rows=await this.db.prepare("SELECT key,value FROM shop_settings WHERE shop_id=? AND key IN ('booking_email_enabled','owner_notification_enabled','reminder_enabled','payment_email_enabled')").bind(shopId).all<{key:string;value:string}>();
    return {booking_email_enabled:"true",owner_notification_enabled:"true",reminder_enabled:"true",payment_email_enabled:"true",...Object.fromEntries(rows.results.map((row)=>[row.key,row.value]))};
  }

  async saveSettings(shopId: string, userId: string, settings: Record<string, boolean>) {
    const now = new Date().toISOString();
    const statements=Object.entries(settings).map(([key,value])=>this.db.prepare(`INSERT INTO shop_settings(id,shop_id,key,value) VALUES(?,?,?,?)
      ON CONFLICT(shop_id,key) DO UPDATE SET value=excluded.value,updated_at=?`).bind(crypto.randomUUID(),shopId,key,String(value),now));
    statements.push(this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,'UPDATE_NOTIFICATION_SETTINGS','shop_settings',?,?)")
      .bind(crypto.randomUUID(),shopId,userId,shopId,JSON.stringify(settings)));
    await this.db.batch(statements);
    return this.settings(shopId);
  }

  async reminderCandidates(today: string, throughDate: string) {
    return this.db.prepare(`SELECT b.id,b.shop_id,b.booking_code,b.customer_id,u.name customer_name,u.email customer_email,u.phone customer_phone,
      ba.name barber_name,sv.name service_name,sv.duration_minutes,b.booking_date,b.start_time,b.end_time,b.total_price,b.status,
      s.name,s.slug,s.phone,s.email,COALESCE((SELECT value FROM shop_settings WHERE shop_id=s.id AND key='address'),s.address) address,
      COALESCE((SELECT value FROM shop_settings WHERE shop_id=s.id AND key='logo'),s.logo_url) logo_url,
      (SELECT email FROM users WHERE shop_id=s.id AND role='SHOP_OWNER' AND status='ACTIVE' ORDER BY created_at,id LIMIT 1) owner_email,
      (SELECT name FROM users WHERE shop_id=s.id AND role='SHOP_OWNER' AND status='ACTIVE' ORDER BY created_at,id LIMIT 1) owner_name,
      (SELECT hostname FROM shop_domains WHERE shop_id=s.id AND is_primary=1 AND status='ACTIVE' AND ssl_status='ACTIVE' LIMIT 1) primary_domain,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='timezone') timezone,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='booking_email_enabled') booking_email_enabled,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='owner_notification_enabled') owner_notification_enabled,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='reminder_enabled') reminder_enabled,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='payment_email_enabled') payment_email_enabled
      FROM bookings b JOIN users u ON u.id=b.customer_id AND u.shop_id=b.shop_id
      JOIN barbers ba ON ba.id=b.barber_id AND ba.shop_id=b.shop_id
      JOIN services sv ON sv.id=b.service_id AND sv.shop_id=b.shop_id
      JOIN shops s ON s.id=b.shop_id
      WHERE b.booking_date BETWEEN ? AND ? AND b.status IN ('PENDING','CONFIRMED')
      AND NOT EXISTS(SELECT 1 FROM email_logs e WHERE e.notification_key='booking:'||b.id||':booking_reminder:customer')
      ORDER BY b.booking_date,b.start_time LIMIT 500`).bind(today,throughDate).all<{
        id:string;shop_id:string;booking_code:string;customer_id:string;customer_name:string;customer_email:string;customer_phone:string|null;
        barber_name:string;service_name:string;duration_minutes:number;booking_date:string;start_time:string;end_time:string;total_price:number;status:string;
        name:string;slug:string;phone:string|null;email:string|null;address:string|null;logo_url:string|null;owner_email:string|null;owner_name:string|null;primary_domain:string|null;timezone:string|null;
        booking_email_enabled:string|null;owner_notification_enabled:string|null;reminder_enabled:string|null;payment_email_enabled:string|null;
      }>();
  }

  async expiringSubscriptions(today: string, until: string) {
    return this.db.prepare(`SELECT sub.id subscription_id,sub.shop_id,sub.plan,sub.expired_at,s.name shop_name,s.slug,
      (SELECT email FROM users WHERE shop_id=s.id AND role='SHOP_OWNER' AND status='ACTIVE' ORDER BY created_at,id LIMIT 1) owner_email,
      (SELECT name FROM users WHERE shop_id=s.id AND role='SHOP_OWNER' AND status='ACTIVE' ORDER BY created_at,id LIMIT 1) owner_name,
      (SELECT value FROM shop_settings WHERE shop_id=s.id AND key='payment_email_enabled') payment_email_enabled,
      (SELECT hostname FROM shop_domains WHERE shop_id=s.id AND is_primary=1 AND status='ACTIVE' AND ssl_status='ACTIVE' LIMIT 1) primary_domain
      FROM subscriptions sub JOIN shops s ON s.id=sub.shop_id
      WHERE sub.status IN ('ACTIVE','TRIALING') AND sub.expired_at>=? AND sub.expired_at<? ORDER BY sub.expired_at LIMIT 500`)
      .bind(today,until).all<{subscription_id:string;shop_id:string;plan:string;expired_at:string;shop_name:string;slug:string;owner_email:string|null;owner_name:string|null;payment_email_enabled:string|null;primary_domain:string|null}>();
  }
}
