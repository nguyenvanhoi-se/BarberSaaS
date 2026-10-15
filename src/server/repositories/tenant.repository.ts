import type { D1Database } from "@cloudflare/workers-types";
import type { TenantContext } from "../types/app";

type TenantRow = TenantContext;

export class TenantRepository {
  constructor(private readonly db: D1Database) {}

  async findByDomain(domain: string): Promise<TenantContext | null> {
    return this.db.prepare(`SELECT s.id,s.name,s.slug,sd.hostname AS domain,s.status,s.plan
      FROM shop_domains sd JOIN shops s ON s.id=sd.shop_id
      WHERE sd.hostname=? AND sd.type='CUSTOM_DOMAIN' AND sd.status='ACTIVE' AND sd.ssl_status='ACTIVE' LIMIT 1`)
      .bind(domain).first<TenantRow>();
  }

  async findBySlug(slug: string): Promise<TenantContext | null> {
    return this.db.prepare("SELECT id,name,slug,NULL AS domain,status,plan FROM shops WHERE slug = ? LIMIT 1")
      .bind(slug).first<TenantRow>();
  }
}
