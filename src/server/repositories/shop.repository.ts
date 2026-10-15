export class ShopRepository {
  constructor(private readonly db: D1Database) {}

  async shop(tenantId: string) {
    const shop = await this.db.prepare("SELECT id, name, slug, domain, logo_url, cover_url, phone, email, address, description, status FROM shops WHERE id = ? LIMIT 1")
      .bind(tenantId).first<Record<string, unknown> & { name: string; logo_url: string | null; cover_url: string | null; phone: string | null; email: string | null; address: string | null; description: string | null; status: string }>();
    if (!shop) return null;
    const settings = await this.db.prepare(`SELECT key, value FROM shop_settings WHERE shop_id = ? AND key IN (
      'business_name', 'logo', 'favicon', 'primary_color', 'secondary_color', 'accent_color', 'font',
      'hero_title', 'hero_description', 'hero_image', 'opening_hours', 'facebook_url', 'instagram_url',
      'tiktok_url', 'google_maps_url', 'phone', 'email', 'address', 'timezone', 'booking_advance_days'
    )`).bind(tenantId).all<{ key: string; value: string }>();
    const publicSettings = Object.fromEntries(settings.results.map((setting) => [setting.key, setting.value]));
    return {
      ...shop,
      name: publicSettings.business_name?.trim() || shop.name,
      logo_url: publicSettings.logo?.trim() || shop.logo_url,
      cover_url: shop.cover_url,
      phone: publicSettings.phone?.trim() || shop.phone,
      email: publicSettings.email?.trim() || shop.email,
      address: publicSettings.address?.trim() || shop.address,
      settings: publicSettings,
    };
  }

  async publicList(tenantId: string, table: "services" | "barbers" | "gallery" | "reviews") {
    const queries = {
      services: "SELECT id, name, description, price, duration_minutes, image_url, created_at FROM services WHERE shop_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC",
      barbers: `SELECT b.id, b.name, b.avatar_url, b.bio, b.experience_years, b.specialties, b.created_at,
        COALESCE(AVG(r.rating), 0) AS rating, COUNT(r.id) AS review_count
        FROM barbers b LEFT JOIN reviews r ON r.shop_id = b.shop_id AND r.barber_id = b.id AND r.status = 'APPROVED'
        WHERE b.shop_id = ? AND b.status = 'ACTIVE' GROUP BY b.id ORDER BY b.created_at DESC`,
      gallery: "SELECT id, title, description, image_url, category, sort_order, created_at FROM gallery WHERE shop_id = ? ORDER BY sort_order, created_at DESC",
      reviews: `SELECT u.name AS customer_name, u.avatar_url AS customer_avatar_url, r.rating, r.comment, r.created_at
        FROM reviews r JOIN users u ON u.id = r.customer_id AND u.shop_id = r.shop_id
        WHERE r.shop_id = ? AND r.status = 'APPROVED' ORDER BY r.created_at DESC`,
    };
    return (await this.db.prepare(queries[table]).bind(tenantId).all()).results;
  }

  async publicBarberById(tenantId: string, barberId: string) {
    return this.db.prepare(`SELECT b.id, b.name, b.avatar_url, b.bio, b.experience_years, b.specialties,
      COALESCE(AVG(r.rating), 0) AS rating, COUNT(r.id) AS review_count
      FROM barbers b LEFT JOIN reviews r ON r.shop_id = b.shop_id AND r.barber_id = b.id AND r.status = 'APPROVED'
      WHERE b.shop_id = ? AND b.id = ? AND b.status = 'ACTIVE' GROUP BY b.id LIMIT 1`)
      .bind(tenantId, barberId).first();
  }

  async shopList(tenantId: string, table: "services" | "barbers" | "gallery" | "reviews") {
    const queries = {
      services: "SELECT id, shop_id, name, description, price, duration_minutes, image_url, status, created_at, updated_at FROM services WHERE shop_id = ? ORDER BY created_at DESC",
      barbers: "SELECT id, shop_id, name, avatar_url, phone, email, bio, experience_years, specialties, status, created_at, updated_at FROM barbers WHERE shop_id = ? ORDER BY created_at DESC",
      gallery: "SELECT id, shop_id, title, description, image_url, category, sort_order, created_at, updated_at FROM gallery WHERE shop_id = ? ORDER BY sort_order, created_at DESC",
      reviews: "SELECT id, shop_id, booking_id, customer_id, barber_id, rating, comment, status, created_at, updated_at FROM reviews WHERE shop_id = ? ORDER BY created_at DESC",
    };
    return (await this.db.prepare(queries[table]).bind(tenantId).all()).results;
  }

  async customers(tenantId: string) {
    return (await this.db.prepare("SELECT id, name, email, phone, avatar_url, created_at FROM users WHERE shop_id = ? AND role = 'CUSTOMER' ORDER BY created_at DESC").bind(tenantId).all()).results;
  }

  async settings(tenantId: string) {
    return (await this.db.prepare("SELECT key, value, updated_at FROM shop_settings WHERE shop_id = ? ORDER BY key").bind(tenantId).all()).results;
  }

  async superAdminShops() {
    return (await this.db.prepare("SELECT id, name, slug, domain, status, plan, created_at FROM shops ORDER BY created_at DESC").all()).results;
  }
}
