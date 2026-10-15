import type { ImageKind } from "../services/storage.service";
import type { AuthUser } from "../../shared/auth";

export type MediaTarget = { kind: ImageKind; resourceId: string | null };
type ExistingMedia = { id: string; r2_key: string | null };

export class MediaRepository {
  constructor(private readonly db: D1Database) {}

  async currentShopMedia(shopId: string, target: MediaTarget): Promise<ExistingMedia | null> {
    if (target.kind === "logo") return this.db.prepare("SELECT id,logo_r2_key AS r2_key FROM shops WHERE id=?").bind(shopId).first();
    if (target.kind === "cover") return this.db.prepare("SELECT id,cover_r2_key AS r2_key FROM shops WHERE id=?").bind(shopId).first();
    if (target.kind === "hero") return this.db.prepare("SELECT id,r2_key FROM shop_settings WHERE shop_id=? AND key='hero_image'").bind(shopId).first();
    if (target.kind === "gallery") return target.resourceId ? this.db.prepare("SELECT id,r2_key FROM gallery WHERE shop_id=? AND id=?").bind(shopId,target.resourceId).first() : null;
    if (!target.resourceId) return null;
    return target.kind === "barber_avatar"
      ? this.db.prepare("SELECT id,r2_key FROM barbers WHERE shop_id=? AND id=?").bind(shopId,target.resourceId).first()
      : this.db.prepare("SELECT id,r2_key FROM services WHERE shop_id=? AND id=?").bind(shopId,target.resourceId).first();
  }

  async saveShopMedia(input: { shopId:string; user:AuthUser; target:MediaTarget; id:string; key:string; url:string; title:string; description:string|null; category:string|null; size:number; mime:string }): Promise<Record<string,unknown>> {
    const {shopId,user,target,id,key,url,title,description,category,size,mime}=input;
    if(target.kind==="gallery"){
      await this.db.batch([
        this.db.prepare("INSERT INTO gallery(id,shop_id,title,description,image_url,r2_key,file_size,mime_type,category) VALUES(?,?,?,?,?,?,?,?,?)")
          .bind(id,shopId,title,description,url,key,size,mime,category),
        this.auditStatement(shopId,user.id,"UPLOAD_GALLERY","gallery",id,{mime_type:mime,file_size:size}),
      ]);
      return (await this.db.prepare("SELECT id,title,description,image_url,category,created_at FROM gallery WHERE shop_id=? AND id=?").bind(shopId,id).first()) ?? {};
    }

    if(target.kind==="logo"){
      await this.db.batch([
        this.db.prepare("UPDATE shops SET logo_url=?,logo_r2_key=?,logo_file_size=?,logo_mime_type=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(url,key,size,mime,shopId),
        this.db.prepare(`INSERT INTO shop_settings(id,shop_id,key,value) VALUES(?,?, 'logo',?) ON CONFLICT(shop_id,key) DO UPDATE SET value=excluded.value,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(crypto.randomUUID(),shopId,url),
        this.auditStatement(shopId,user.id,"UPDATE_SHOP_LOGO","shop",shopId,{mime_type:mime,file_size:size}),
      ]);
    } else if(target.kind==="cover"){
      await this.db.batch([
        this.db.prepare("UPDATE shops SET cover_url=?,cover_r2_key=?,cover_file_size=?,cover_mime_type=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(url,key,size,mime,shopId),
        this.auditStatement(shopId,user.id,"UPDATE_SHOP_COVER","shop",shopId,{mime_type:mime,file_size:size}),
      ]);
    } else if(target.kind==="hero"){
      await this.db.batch([
        this.db.prepare(`INSERT INTO shop_settings(id,shop_id,key,value,r2_key,file_size,mime_type) VALUES(?,?, 'hero_image',?,?,?,?)
          ON CONFLICT(shop_id,key) DO UPDATE SET value=excluded.value,r2_key=excluded.r2_key,file_size=excluded.file_size,mime_type=excluded.mime_type,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(crypto.randomUUID(),shopId,url,key,size,mime),
        this.auditStatement(shopId,user.id,"UPDATE_HERO_IMAGE","shop",shopId,{mime_type:mime,file_size:size}),
      ]);
    } else if(target.kind==="barber_avatar"){
      const result=await this.db.batch([
        this.db.prepare("UPDATE barbers SET avatar_url=?,r2_key=?,avatar_file_size=?,avatar_mime_type=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=?").bind(url,key,size,mime,shopId,target.resourceId),
        this.auditOnChange(shopId,user.id,"UPDATE_BARBER_AVATAR","barber",target.resourceId!),
      ]);
      if(result[0]?.meta.changes!==1)throw new Error("Barber media target no longer exists");
    } else {
      const result=await this.db.batch([
        this.db.prepare("UPDATE services SET image_url=?,r2_key=?,file_size=?,mime_type=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=?").bind(url,key,size,mime,shopId,target.resourceId),
        this.auditOnChange(shopId,user.id,"UPDATE_SERVICE_IMAGE","service",target.resourceId!),
      ]);
      if(result[0]?.meta.changes!==1)throw new Error("Service media target no longer exists");
    }
    return {id:target.resourceId??id,r2_key:key,url,file_size:size,mime_type:mime};
  }

  async clearShopMedia(shopId:string,user:AuthUser,target:MediaTarget):Promise<string|null>{
    const current=await this.currentShopMedia(shopId,target);if(!current)return null;
    if(target.kind==="gallery"){
      await this.db.batch([this.db.prepare("DELETE FROM gallery WHERE shop_id=? AND id=?").bind(shopId,current.id),this.auditOnChange(shopId,user.id,"DELETE_GALLERY","gallery",current.id)]);
    } else if(target.kind==="logo"){
      await this.db.batch([
        this.db.prepare("UPDATE shops SET logo_url=NULL,logo_r2_key=NULL,logo_file_size=NULL,logo_mime_type=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(shopId),
        this.db.prepare("DELETE FROM shop_settings WHERE shop_id=? AND key='logo'").bind(shopId),
        this.auditStatement(shopId,user.id,"REMOVE_SHOP_LOGO","shop",shopId),
      ]);
    } else if(target.kind==="cover"){
      await this.db.batch([this.db.prepare("UPDATE shops SET cover_url=NULL,cover_r2_key=NULL,cover_file_size=NULL,cover_mime_type=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(shopId),this.auditStatement(shopId,user.id,"REMOVE_SHOP_COVER","shop",shopId)]);
    } else if(target.kind==="hero"){
      await this.db.prepare("UPDATE shop_settings SET value='',r2_key=NULL,file_size=NULL,mime_type=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND key='hero_image'").bind(shopId).run();
      await this.audit(shopId,user.id,"REMOVE_HERO_IMAGE","shop",shopId);
    } else if(target.kind==="barber_avatar"){
      await this.db.batch([this.db.prepare("UPDATE barbers SET avatar_url=NULL,r2_key=NULL,avatar_file_size=NULL,avatar_mime_type=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=?").bind(shopId,current.id),this.auditStatement(shopId,user.id,"REMOVE_BARBER_AVATAR","barber",current.id)]);
    } else {
      await this.db.batch([this.db.prepare("UPDATE services SET image_url=NULL,r2_key=NULL,file_size=NULL,mime_type=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE shop_id=? AND id=?").bind(shopId,current.id),this.auditStatement(shopId,user.id,"REMOVE_SERVICE_IMAGE","service",current.id)]);
    }
    return current.r2_key;
  }

  async currentUserMedia(userId:string):Promise<string|null>{return (await this.db.prepare("SELECT avatar_r2_key FROM users WHERE id=?").bind(userId).first<{avatar_r2_key:string|null}>())?.avatar_r2_key??null;}
  async saveUserMedia(userId:string,key:string,url:string,size:number,mime:string):Promise<void>{await this.db.batch([
    this.db.prepare("UPDATE users SET avatar_url=?,avatar_r2_key=?,avatar_file_size=?,avatar_mime_type=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(url,key,size,mime,userId),
    this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id) SELECT ?,shop_id,id,'UPDATE_USER_AVATAR','user',? FROM users WHERE id=?").bind(crypto.randomUUID(),userId,userId),
  ]);}
  async clearUserMedia(userId:string):Promise<string|null>{const key=await this.currentUserMedia(userId);if(!key)return null;await this.db.batch([
    this.db.prepare("UPDATE users SET avatar_url=NULL,avatar_r2_key=NULL,avatar_file_size=NULL,avatar_mime_type=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(userId),
    this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id) SELECT ?,shop_id,id,'REMOVE_USER_AVATAR','user',? FROM users WHERE id=?").bind(crypto.randomUUID(),userId,userId),
  ]);return key;}

  async isReferenced(key:string):Promise<boolean>{const row=await this.db.prepare(`SELECT EXISTS(SELECT 1 FROM shops WHERE logo_r2_key=? OR cover_r2_key=?) OR
    EXISTS(SELECT 1 FROM shop_settings WHERE r2_key=?) OR EXISTS(SELECT 1 FROM services WHERE r2_key=?) OR
    EXISTS(SELECT 1 FROM barbers WHERE r2_key=?) OR EXISTS(SELECT 1 FROM users WHERE avatar_r2_key=?) OR
    EXISTS(SELECT 1 FROM gallery WHERE r2_key=?) AS referenced`).bind(key,key,key,key,key,key,key).first<{referenced:number}>();return row?.referenced===1;}

  async audit(shopId:string,userId:string,action:string,entity:string,entityId:string){await this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),shopId,userId,action,entity,entityId).run();}
  private auditStatement(shopId:string,userId:string,action:string,entity:string,entityId:string,metadata?:unknown){return this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),shopId,userId,action,entity,entityId,metadata?JSON.stringify(metadata):null);}
  private auditOnChange(shopId:string,userId:string,action:string,entity:string,entityId:string){return this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id) SELECT ?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),shopId,userId,action,entity,entityId);}
}

