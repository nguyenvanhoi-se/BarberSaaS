import type { AuthUser } from "../../shared/auth";

export type BookingServiceRow = { id: string; name: string; price: number; duration_minutes: number };
export type BarberScheduleRow = {
  id: string; name: string; avatar_url: string | null; experience_years: number; specialties: string;
  day_off: number; start_time: string | null; end_time: string | null;
};
export type BusyInterval = { barber_id: string; start_time: string; end_time: string };
export type BookingSummary = {
  id: string; shop_id: string; booking_code: string; customer_id: string; customer_name: string;
  customer_email: string; customer_phone: string | null; barber_id: string; barber_name: string;
  service_id: string; service_name: string; duration_minutes: number; booking_date: string;
  start_time: string; end_time: string; total_price: number; note: string | null;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  created_at: string; updated_at: string;
};

export class BookingRepository {
  constructor(private readonly db: D1Database) {}

  service(shopId: string, serviceId: string) {
    return this.db.prepare("SELECT id, name, price, duration_minutes FROM services WHERE shop_id = ? AND id = ? AND status = 'ACTIVE' LIMIT 1")
      .bind(shopId, serviceId).first<BookingServiceRow>();
  }

  barber(shopId: string, barberId: string) {
    return this.db.prepare("SELECT id, name FROM barbers WHERE shop_id = ? AND id = ? AND status = 'ACTIVE' LIMIT 1")
      .bind(shopId, barberId).first<{ id: string; name: string }>();
  }

  schedules(shopId: string, dayOfWeek: number, barberId?: string) {
    const barberCondition = barberId ? " AND b.id = ?" : "";
    const statement = this.db.prepare(`SELECT b.id, b.name, b.avatar_url, b.experience_years, b.specialties,
      h.is_day_off AS day_off, h.start_time, h.end_time
      FROM barbers b JOIN barber_working_hours h ON h.shop_id = b.shop_id AND h.barber_id = b.id
      WHERE b.shop_id = ? AND b.status = 'ACTIVE' AND h.day_of_week = ?${barberCondition}
      ORDER BY b.id`);
    return barberId ? statement.bind(shopId, dayOfWeek, barberId).all<BarberScheduleRow>() : statement.bind(shopId, dayOfWeek).all<BarberScheduleRow>();
  }

  busyIntervals(shopId: string, date: string, barberIds: string[]) {
    if (barberIds.length === 0) return Promise.resolve({ results: [] as BusyInterval[] });
    const placeholders = barberIds.map(() => "?").join(",");
    return this.db.prepare(`SELECT barber_id, start_time, end_time FROM bookings
      WHERE shop_id = ? AND booking_date = ? AND status <> 'CANCELLED'
        AND barber_id IN (${placeholders}) ORDER BY start_time`)
      .bind(shopId, date, ...barberIds).all<BusyInterval>();
  }

  async settingMap(shopId: string) {
    const rows = await this.db.prepare(`SELECT key, value FROM shop_settings WHERE shop_id = ? AND key IN
      ('opening_hours', 'timezone', 'slot_interval_minutes', 'booking_advance_days', 'cancellation_window_hours')`)
      .bind(shopId).all<{ key: string; value: string }>();
    return Object.fromEntries(rows.results.map((row) => [row.key, row.value]));
  }

  async createAtomically(input: {
    id: string; shopId: string; code: string; customerId: string; barberId: string;
    serviceId: string; date: string; start: string; end: string; price: number; note: string | null;
    userId: string;monthlyLimit:number|null;monthStart:string;monthEnd:string;
  }) {
    try {
      const results = await this.db.batch([
        this.db.prepare(`INSERT INTO bookings
          (id, shop_id, booking_code, customer_id, barber_id, service_id, booking_date, start_time, end_time, total_price, note, status)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING'
          WHERE ? IS NULL OR (SELECT COUNT(*) FROM bookings WHERE shop_id=? AND created_at>=? AND created_at<? AND status<>'CANCELLED') < ?`)
          .bind(input.id, input.shopId, input.code, input.customerId, input.barberId, input.serviceId, input.date, input.start, input.end, input.price, input.note,input.monthlyLimit,input.shopId,input.monthStart,input.monthEnd,input.monthlyLimit),
        this.db.prepare(`INSERT INTO audit_logs (id, shop_id, user_id, action, entity, entity_id, metadata)
          SELECT ?, ?, ?, 'CREATE_BOOKING', 'booking', ?, ? WHERE changes()=1`)
          .bind(crypto.randomUUID(), input.shopId, input.userId, input.id, JSON.stringify({ booking_code: input.code })),
      ]);
      return results[0]?.meta.changes === 1;
    } catch (error) {
      if (error instanceof Error && error.message.includes("BOOKING_SLOT_CONFLICT")) return false;
      throw error;
    }
  }

  async bookingCountForMonth(shopId:string,start:string,end:string){return (await this.db.prepare("SELECT COUNT(*) used FROM bookings WHERE shop_id=? AND created_at>=? AND created_at<? AND status<>'CANCELLED'").bind(shopId,start,end).first<{used:number}>())?.used??0;}

  customerBooking(shopId: string, customerId: string, bookingId: string) {
    return this.db.prepare(`${this.selectSummary()}
      WHERE bk.shop_id = ? AND bk.customer_id = ? AND bk.id = ? LIMIT 1`)
      .bind(shopId, customerId, bookingId).first<BookingSummary>();
  }

  customerBookings(shopId: string, customerId: string) {
    return this.db.prepare(`${this.selectSummary()}
      WHERE bk.shop_id = ? AND bk.customer_id = ? ORDER BY bk.booking_date DESC, bk.start_time DESC`)
      .bind(shopId, customerId).all<BookingSummary>();
  }

  bookingForStatus(shopId: string, bookingId: string, user: AuthUser) {
    const barberCondition = user.role === "BARBER"
      ? " AND EXISTS (SELECT 1 FROM barber_user_links l WHERE l.shop_id = bk.shop_id AND l.barber_id = bk.barber_id AND l.user_id = ?)"
      : "";
    const values = user.role === "BARBER" ? [shopId, bookingId, user.id] : [shopId, bookingId];
    return this.db.prepare(`${this.selectSummary()} WHERE bk.shop_id = ? AND bk.id = ?${barberCondition} LIMIT 1`)
      .bind(...values).first<BookingSummary>();
  }

  async shopBookings(shopId: string, user: AuthUser, filters: {
    date?: string; status?: string; barber_id?: string; customer_id?: string; search?: string; page: number; limit: number;
  }) {
    const clauses = ["bk.shop_id = ?"];
    const values: (string | number)[] = [shopId];
    if (filters.date) { clauses.push("bk.booking_date = ?"); values.push(filters.date); }
    if (filters.status) { clauses.push("bk.status = ?"); values.push(filters.status); }
    if (user.role === "BARBER") {
      clauses.push("EXISTS (SELECT 1 FROM barber_user_links l WHERE l.shop_id = bk.shop_id AND l.barber_id = bk.barber_id AND l.user_id = ?)");
      values.push(user.id);
    } else if (filters.barber_id) { clauses.push("bk.barber_id = ?"); values.push(filters.barber_id); }
    if (filters.customer_id && user.role === "SHOP_OWNER") { clauses.push("bk.customer_id = ?"); values.push(filters.customer_id); }
    if (filters.search) {
      clauses.push("(bk.booking_code LIKE ? OR cu.name LIKE ? OR cu.phone LIKE ? OR sv.name LIKE ? OR ba.name LIKE ?)");
      const term = `%${filters.search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      values.push(term, term, term, term, term);
    }
    const where = clauses.join(" AND ");
    const offset = (filters.page - 1) * filters.limit;
    const rows = await this.db.prepare(`${this.selectSummary()} WHERE ${where}
      ORDER BY bk.booking_date DESC, bk.start_time DESC LIMIT ? OFFSET ?`)
      .bind(...values, filters.limit, offset).all<BookingSummary>();
    const count = await this.db.prepare(`SELECT COUNT(*) AS total FROM bookings bk
      JOIN users cu ON cu.id = bk.customer_id AND cu.shop_id = bk.shop_id
      JOIN services sv ON sv.id = bk.service_id AND sv.shop_id = bk.shop_id
      JOIN barbers ba ON ba.id = bk.barber_id AND ba.shop_id = bk.shop_id
      WHERE ${where}`).bind(...values).first<{ total: number }>();
    return { items: rows.results, page: filters.page, limit: filters.limit, total: count?.total ?? 0 };
  }

  async updateStatus(input: { shopId: string; bookingId: string; from: string; to: string; userId: string; userRole: string }) {
    const barberCondition = input.userRole === "BARBER"
      ? " AND EXISTS (SELECT 1 FROM barber_user_links l WHERE l.shop_id = bookings.shop_id AND l.barber_id = bookings.barber_id AND l.user_id = ?)"
      : "";
    const update = this.db.prepare(`UPDATE bookings SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE shop_id = ? AND id = ? AND status = ?${barberCondition}`)
      .bind(input.to, input.shopId, input.bookingId, input.from, ...(input.userRole === "BARBER" ? [input.userId] : []));
    const action = input.to === "CONFIRMED" ? "CONFIRM_BOOKING" : input.to === "COMPLETED" ? "COMPLETE_BOOKING" : input.to === "NO_SHOW" ? "NO_SHOW_BOOKING" : "CANCEL_BOOKING";
    const audit = this.db.prepare(`INSERT INTO audit_logs (id, shop_id, user_id, action, entity, entity_id, metadata)
      SELECT ?, ?, ?, ?, 'booking', ?, ? WHERE changes() = 1`)
      .bind(crypto.randomUUID(), input.shopId, input.userId, action, input.bookingId, JSON.stringify({ from: input.from, to: input.to }));
    const results = await this.db.batch([update, audit]);
    return results[0]?.meta.changes === 1;
  }

  private selectSummary() {
    return `SELECT bk.id, bk.shop_id, bk.booking_code, bk.customer_id, cu.name AS customer_name, cu.email AS customer_email,
      cu.phone AS customer_phone, bk.barber_id, ba.name AS barber_name, bk.service_id, sv.name AS service_name,
      sv.duration_minutes, bk.booking_date, bk.start_time, bk.end_time, bk.total_price, bk.note, bk.status, bk.created_at, bk.updated_at
      FROM bookings bk JOIN users cu ON cu.id = bk.customer_id AND cu.shop_id = bk.shop_id
      JOIN services sv ON sv.id = bk.service_id AND sv.shop_id = bk.shop_id
      JOIN barbers ba ON ba.id = bk.barber_id AND ba.shop_id = bk.shop_id`;
  }
}
