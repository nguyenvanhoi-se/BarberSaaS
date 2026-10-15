export type ShopDomain={id:string;shop_id:string;hostname:string;type:"CUSTOM_DOMAIN"|"SUBDOMAIN";status:"PENDING"|"VERIFYING"|"ACTIVE"|"FAILED"|"DISABLED";cloudflare_hostname_id:string|null;verification_method:"http"|"txt"|"email";verification_status:string;ssl_status:string;cname_target:string|null;verification_records:string|null;is_primary:number;created_at:string;updated_at:string};
export class DomainRepository {
  constructor(private readonly db:D1Database){}
  list(shopId:string){return this.db.prepare("SELECT id,shop_id,hostname,type,status,cloudflare_hostname_id,verification_method,verification_status,ssl_status,cname_target,verification_records,is_primary,created_at,updated_at FROM shop_domains WHERE shop_id=? AND type='CUSTOM_DOMAIN' ORDER BY created_at DESC").bind(shopId).all<ShopDomain>();}
  find(shopId:string,id:string){return this.db.prepare("SELECT id,shop_id,hostname,type,status,cloudflare_hostname_id,verification_method,verification_status,ssl_status,cname_target,verification_records,is_primary,created_at,updated_at FROM shop_domains WHERE shop_id=? AND id=? LIMIT 1").bind(shopId,id).first<ShopDomain>();}
  findByHostname(hostname:string){return this.db.prepare("SELECT id,shop_id,hostname,type,status,cloudflare_hostname_id FROM shop_domains WHERE hostname=? AND status<>'DISABLED' LIMIT 1").bind(hostname).first<Pick<ShopDomain,"id"|"shop_id"|"hostname"|"type"|"status"|"cloudflare_hostname_id">>();}
  primary(shopId:string){return this.db.prepare("SELECT hostname FROM shop_domains WHERE shop_id=? AND type='CUSTOM_DOMAIN' AND is_primary=1 AND status='ACTIVE' AND ssl_status='ACTIVE' LIMIT 1").bind(shopId).first<{hostname:string}>();}
  async create(input:{id:string;shopId:string;hostname:string;method:"http"|"txt"|"email";cloudflareHostnameId:string|null;cnameTarget:string|null;status:ShopDomain["status"];verificationStatus:string;sslStatus:string;records:unknown}){
    await this.db.prepare(`INSERT INTO shop_domains(id,shop_id,hostname,type,status,cloudflare_hostname_id,verification_method,verification_status,ssl_status,cname_target,verification_records)
      VALUES(?,?,?,'CUSTOM_DOMAIN',?,?,?,?,?,?,?)`).bind(input.id,input.shopId,input.hostname,input.status,input.cloudflareHostnameId,input.method,input.verificationStatus,input.sslStatus,input.cnameTarget,input.records===null?null:JSON.stringify(input.records)).run();
  }
  async sync(shopId:string,id:string,input:{status:string;verificationStatus:string;sslStatus:string;records:unknown;cnameTarget:string|null}){
    await this.db.prepare(`UPDATE shop_domains SET status=?,verification_status=?,ssl_status=?,verification_records=?,cname_target=COALESCE(?,cname_target),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=?`)
      .bind(input.status,input.verificationStatus,input.sslStatus,JSON.stringify(input.records),input.cnameTarget,shopId,id).run();
  }
  async setPrimary(shopId:string,id:string|null,userId:string){
    const target=id?await this.find(shopId,id):null;
    const updates=[this.db.prepare("UPDATE shop_domains SET is_primary=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND is_primary=1").bind(shopId)];
    if(id)updates.push(this.db.prepare("UPDATE shop_domains SET is_primary=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=? AND status='ACTIVE' AND ssl_status='ACTIVE'").bind(shopId,id));
    updates.push(this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,'DOMAIN_SET_PRIMARY','shop_domain',?,?)").bind(crypto.randomUUID(),shopId,userId,id,JSON.stringify({hostname:target?.hostname??null,old_status:target?.status??null,new_status:id?"PRIMARY":"PLATFORM"})));
    const result=await this.db.batch(updates);return !id||result[1]?.meta.changes===1;
  }
  async disable(shopId:string,id:string,userId:string,cloudflareHostnameId:string|null,hostname:string,oldStatus:string){
    const result=await this.db.batch([
      this.db.prepare("UPDATE shop_domains SET status='DISABLED',verification_status='DISABLED',is_primary=0,cloudflare_hostname_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=? AND status<>'DISABLED'").bind(cloudflareHostnameId,shopId,id),
      this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) SELECT ?,?,?,'DOMAIN_REMOVED','shop_domain',?,? WHERE changes()=1").bind(crypto.randomUUID(),shopId,userId,id,JSON.stringify({hostname,old_status:oldStatus,new_status:"DISABLED"})),
    ]);return result[0]?.meta.changes===1;
  }
  async audit(shopId:string,userId:string,action:string,domain:ShopDomain,oldStatus:string|null,newStatus:string|null){
    await this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,?,'shop_domain',?,?)")
      .bind(crypto.randomUUID(),shopId,userId,action,domain.id,JSON.stringify({hostname:domain.hostname,old_status:oldStatus,new_status:newStatus})).run();
  }
  async shopDomains(shopId:string){return this.db.prepare("SELECT id,hostname,type,status,verification_method,verification_status,ssl_status,is_primary,created_at,updated_at FROM shop_domains WHERE shop_id=? ORDER BY type,created_at DESC").bind(shopId).all();}
  async setSuperAdminStatus(id:string,status:"DISABLED",userId:string,cloudflareHostnameId:string|null){
    const existing=await this.db.prepare("SELECT id,shop_id,hostname,status FROM shop_domains WHERE id=?").bind(id).first<{id:string;shop_id:string;hostname:string;status:string}>();if(!existing)return null;
    await this.db.batch([this.db.prepare("UPDATE shop_domains SET status='DISABLED',verification_status='DISABLED',cloudflare_hostname_id=?,is_primary=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(cloudflareHostnameId,id),this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,'DOMAIN_DISABLED','shop_domain',?,?)").bind(crypto.randomUUID(),existing.shop_id,userId,id,JSON.stringify({hostname:existing.hostname,old_status:existing.status,new_status:status}))]);return existing;
  }
}
