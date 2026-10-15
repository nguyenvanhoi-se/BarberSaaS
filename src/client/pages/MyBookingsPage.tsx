import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Scissors } from "lucide-react";
import { cancelCustomerBooking, getCustomerBooking, getCustomerBookings, submitCustomerReview, type Booking } from "../api/booking-api";
import { useCurrentShop } from "../tenant/ShopSite";
import { CardSkeleton, EmptyState, ErrorState } from "../components/States";

type Filter = "ALL" | "UPCOMING" | "COMPLETED" | "CANCELLED";
const today = (zone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
};
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("vi-VN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const priceLabel = (price: number) => `${price.toLocaleString("vi-VN")} ₫`;
const statusClass: Record<Booking["status"], string> = { PENDING: "text-amber-200", CONFIRMED: "text-emerald-300", COMPLETED: "text-neutral-300", CANCELLED: "text-red-300", NO_SHOW: "text-red-300" };

function BookingCard({ booking, onCancel }: { booking: Booking; onCancel?: (id: string) => void }) {
  return <article className="content-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-neutral-500">{booking.booking_code}</p><h2 className="mt-2 font-display text-xl text-white">{booking.service_name}</h2><p className="mt-1 text-sm text-neutral-400">with {booking.barber_name}</p></div><span className={`rounded-full border border-white/10 px-3 py-1 text-xs font-semibold ${statusClass[booking.status]}`}>{booking.status}</span></div>
    <div className="mt-5 grid gap-3 text-sm text-neutral-300 sm:grid-cols-3"><p className="flex items-center gap-2"><CalendarDays size={16} className="text-[var(--accent-color)]"/>{dateLabel(booking.booking_date)}</p><p className="flex items-center gap-2"><Clock3 size={16} className="text-[var(--accent-color)]"/>{booking.start_time} – {booking.end_time}</p><p className="flex items-center gap-2"><Scissors size={16} className="text-[var(--accent-color)]"/>{priceLabel(booking.total_price)}</p></div>
    <div className="mt-5 flex flex-wrap gap-4"><Link to={`/my-bookings/${booking.id}`} className="text-sm font-semibold text-[var(--accent-color)]">Booking details</Link>{onCancel && <button type="button" onClick={() => onCancel(booking.id)} className="text-sm text-red-300 hover:text-red-200">Cancel booking</button>}</div></article>;
}

export function MyBookingsPage() {
  const shop = useCurrentShop();
  const shopToday = today(shop.settings.timezone || "Asia/Ho_Chi_Minh");
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>("ALL");
  const query = useQuery({ queryKey: ["customer", shop.id, "bookings"], queryFn: getCustomerBookings });
  const cancel = useMutation({ mutationFn: cancelCustomerBooking, onSuccess: () => client.invalidateQueries({ queryKey: ["customer", shop.id, "bookings"] }) });
  const items = (query.data ?? []).filter((booking) => {
    if (filter === "UPCOMING") return ["PENDING", "CONFIRMED"].includes(booking.status) && booking.booking_date >= shopToday;
    if (filter === "COMPLETED") return booking.status === "COMPLETED";
    if (filter === "CANCELLED") return booking.status === "CANCELLED";
    return true;
  });
  function cancelBooking(id: string) { if (window.confirm("Cancel this booking?")) cancel.mutate(id); }
  return <main className="site-container max-w-5xl py-12 sm:py-16"><p className="text-xs font-bold uppercase tracking-[.25em] text-[var(--accent-color)]">Your visits</p><h1 className="mt-3 font-display text-4xl text-white">My bookings</h1><div className="my-7 flex flex-wrap gap-2" aria-label="Filter bookings">{(["ALL", "UPCOMING", "COMPLETED", "CANCELLED"] as const).map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)} className={`rounded-full border px-4 py-2 text-xs font-semibold ${filter === item ? "border-[var(--accent-color)] bg-[var(--accent-color)] text-black" : "border-white/15 text-neutral-300"}`}>{item === "UPCOMING" ? "Upcoming" : item[0] + item.slice(1).toLowerCase()}</button>)}</div>
    {cancel.isError && <p role="alert" className="mb-4 text-sm text-red-300">{cancel.error instanceof Error ? cancel.error.message : "Could not cancel this booking."}</p>}
    {query.isPending ? <CardSkeleton count={2}/> : query.isError ? <ErrorState title="Unable to load your bookings" onRetry={() => { void query.refetch(); }}/> : items.length ? <div className="grid gap-4">{items.map((booking) => <BookingCard key={booking.id} booking={booking} onCancel={["PENDING", "CONFIRMED"].includes(booking.status) ? cancelBooking : undefined}/>)}</div> : <EmptyState title="No bookings here yet" message="Bookings matching this filter will appear here."/>}
    <Link to="/book" className="button button-primary mt-7">Book an appointment</Link>
  </main>;
}

export function MyBookingDetailPage() {
  const shop = useCurrentShop();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["customer", shop.id, "booking", id], queryFn: () => getCustomerBooking(id), enabled: Boolean(id) });
  const cancel = useMutation({ mutationFn: cancelCustomerBooking, onSuccess: async () => { await client.invalidateQueries({ queryKey: ["customer", shop.id, "bookings"] }); await query.refetch(); } });
  const [rating,setRating]=useState(5),[comment,setComment]=useState("");
  const review=useMutation({mutationFn:()=>submitCustomerReview(id,{rating,comment}),onSuccess:async()=>{await client.invalidateQueries({queryKey:["customer",shop.id,"bookings"]});await query.refetch();}});
  if (query.isPending) return <main className="site-container max-w-3xl py-16"><CardSkeleton count={1}/></main>;
  if (query.isError || !query.data) return <main className="site-container max-w-3xl py-16"><ErrorState title="Booking not found" onRetry={() => { void query.refetch(); }}/><Link to="/my-bookings" className="mt-5 inline-block text-[var(--accent-color)]">Back to my bookings</Link></main>;
  const booking = query.data;
  return <main className="site-container max-w-3xl py-12 sm:py-16"><Link to="/my-bookings" className="text-sm text-[var(--accent-color)]">← My bookings</Link><h1 className="mb-6 mt-4 font-display text-3xl text-white">Booking details</h1><BookingCard booking={booking}/>{cancel.isError && <p role="alert" className="mt-4 text-sm text-red-300">{cancel.error instanceof Error ? cancel.error.message : "Could not cancel this booking."}</p>}{["PENDING", "CONFIRMED"].includes(booking.status) && <button type="button" className="button button-outline mt-6" onClick={() => { if (window.confirm("Cancel this booking?")) cancel.mutate(booking.id); }} disabled={cancel.isPending}>Cancel booking</button>}{booking.status==="COMPLETED"&&<section className="content-card mt-6 p-5 sm:p-6" aria-labelledby="review-heading"><h2 id="review-heading" className="font-display text-2xl text-white">Leave a review</h2>{booking.review?<p className="mt-3 text-sm text-neutral-300" role="status">Your {booking.review.rating}-star review is {booking.review.status.toLowerCase()}.</p>:<form className="mt-4 grid gap-4" onSubmit={(event)=>{event.preventDefault();review.mutate();}}><label className="grid gap-2 text-sm text-neutral-300">Rating<select className="admin-select max-w-40" value={rating} onChange={(event)=>setRating(Number(event.target.value))}>{[5,4,3,2,1].map((value)=><option key={value} value={value}>{value} {value===1?"star":"stars"}</option>)}</select></label><label className="grid gap-2 text-sm text-neutral-300">Comment<textarea className="admin-input min-h-28" maxLength={2000} value={comment} onChange={(event)=>setComment(event.target.value)} placeholder="Share how your visit went"/></label>{review.isError&&<p role="alert" className="text-sm text-red-300">{review.error instanceof Error?review.error.message:"Could not submit your review."}</p>}<button className="button button-primary w-fit" disabled={review.isPending}>{review.isPending?"Submitting…":"Submit review"}</button></form>}</section>}</main>;
}
