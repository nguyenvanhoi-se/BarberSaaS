export type CustomerReview = { id: string; rating: number; comment: string | null; status: string; created_at: string };

export class CustomerReviewRepository {
  constructor(private readonly db: D1Database) {}

  forCustomerBooking(shopId: string, customerId: string, bookingId: string) {
    return this.db.prepare(`SELECT r.id,r.rating,r.comment,r.status,r.created_at FROM reviews r
      JOIN bookings b ON b.id=r.booking_id AND b.shop_id=r.shop_id
      WHERE r.shop_id=? AND r.customer_id=? AND b.customer_id=? AND b.id=? LIMIT 1`)
      .bind(shopId, customerId, customerId, bookingId).first<CustomerReview>();
  }

  async createForCompletedBooking(input: { shopId: string; customerId: string; bookingId: string; rating: number; comment: string | null }) {
    const id = crypto.randomUUID();
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO reviews(id,shop_id,booking_id,customer_id,barber_id,rating,comment,status)
        SELECT ?,b.shop_id,b.id,b.customer_id,b.barber_id,?,?,'PENDING' FROM bookings b
        WHERE b.shop_id=? AND b.customer_id=? AND b.id=? AND b.status='COMPLETED'
        ON CONFLICT(shop_id,booking_id) DO NOTHING`)
        .bind(id, input.rating, input.comment, input.shopId, input.customerId, input.bookingId),
      this.db.prepare(`INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata)
        SELECT ?,?,?, 'CREATE_REVIEW','review',?,? WHERE changes()=1`)
        .bind(crypto.randomUUID(), input.shopId, input.customerId, id, JSON.stringify({ rating: input.rating })),
    ]);
    return results[0]?.meta.changes === 1 ? id : null;
  }

  customerBookingState(shopId: string, customerId: string, bookingId: string) {
    return this.db.prepare("SELECT status FROM bookings WHERE shop_id=? AND customer_id=? AND id=? LIMIT 1")
      .bind(shopId, customerId, bookingId).first<{ status: string }>();
  }
}
