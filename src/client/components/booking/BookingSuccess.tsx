import type { Booking } from "../../api/booking-api";
import type { PublicShop } from "../../api/public-api";
import { BookingSummary } from "./BookingSummary";

export function BookingSuccess({ booking, shop }: { booking: Booking; shop: PublicShop }) {
  const service = { id: booking.service_id, name: booking.service_name, price: booking.total_price, duration_minutes: booking.duration_minutes, description: null, image_url: null };
  return <section className="mx-auto max-w-2xl py-8 text-center" aria-live="polite"><div className="mb-5 text-5xl text-[var(--accent-color)]" aria-hidden="true">✓</div><p className="text-xs font-bold uppercase tracking-[.25em] text-[var(--accent-color)]">Booking successful</p><h2 className="mt-3 font-display text-3xl text-white">Your visit is reserved</h2><p className="mt-2 text-neutral-400">Booking code <strong className="text-white">{booking.booking_code}</strong> · {booking.status}</p><div className="mt-8 text-left"><BookingSummary shopName={shop.name} service={service} barber={null} barberName={booking.barber_name} date={booking.booking_date} time={booking.start_time} endTime={booking.end_time}/></div></section>;
}
