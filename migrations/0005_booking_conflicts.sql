-- Keep the no-overlap invariant inside D1 so concurrent requests cannot race a preflight check.
CREATE INDEX bookings_active_slot_lookup_idx
  ON bookings(shop_id, barber_id, booking_date, status, start_time, end_time);

CREATE TRIGGER bookings_prevent_overlapping_insert
BEFORE INSERT ON bookings
WHEN NEW.status IN ('PENDING', 'CONFIRMED')
 AND EXISTS (
   SELECT 1 FROM bookings existing
   WHERE existing.shop_id = NEW.shop_id
     AND existing.barber_id = NEW.barber_id
     AND existing.booking_date = NEW.booking_date
     AND existing.status IN ('PENDING', 'CONFIRMED')
     AND NEW.start_time < existing.end_time
     AND NEW.end_time > existing.start_time
 )
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_SLOT_CONFLICT');
END;

CREATE TRIGGER bookings_prevent_overlapping_update
BEFORE UPDATE OF shop_id, barber_id, booking_date, start_time, end_time, status ON bookings
WHEN NEW.status IN ('PENDING', 'CONFIRMED')
 AND EXISTS (
   SELECT 1 FROM bookings existing
   WHERE existing.id <> OLD.id
     AND existing.shop_id = NEW.shop_id
     AND existing.barber_id = NEW.barber_id
     AND existing.booking_date = NEW.booking_date
     AND existing.status IN ('PENDING', 'CONFIRMED')
     AND NEW.start_time < existing.end_time
     AND NEW.end_time > existing.start_time
 )
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_SLOT_CONFLICT');
END;
