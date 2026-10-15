import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3, Star } from "lucide-react";
import type { PublicBarber, PublicReview, PublicService } from "../api/public-api";
import { Image } from "./Image";

const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

export function ServiceCard({ service }: { service: PublicService }) {
  return <article className="content-card overflow-hidden">
    <Image src={service.image_url} alt={service.name} className="aspect-[4/3] w-full object-cover"/>
    <div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><h3 className="font-display text-xl text-white">{service.name}</h3><span className="whitespace-nowrap text-sm font-semibold text-[var(--accent-color)]">{currency.format(service.price)}</span></div>
      <p className="mt-3 min-h-10 text-sm leading-6 text-neutral-400">{service.description || "A considered service, delivered with care."}</p>
      <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500"><Clock3 size={14}/>{service.duration_minutes} minutes</div>
      <details className="group mt-5 border-t border-white/10 pt-4"><summary className="flex cursor-pointer list-none items-center justify-between text-sm text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-color)]">View details <ArrowUpRight className="transition-transform group-open:rotate-45" size={16}/></summary><p className="mt-3 text-sm leading-6 text-neutral-400">{service.description || `${service.duration_minutes} minute appointment.`}</p></details>
      <Link className="button button-outline mt-5 w-full" to={`/book?service=${encodeURIComponent(service.id)}`}>Book this service</Link>
    </div>
  </article>;
}

export function BarberCard({ barber }: { barber: PublicBarber }) {
  const specialties = readSpecialties(barber.specialties);
  return <article className="content-card overflow-hidden">
    <Image src={barber.avatar_url} alt={barber.name} className="aspect-[4/3] w-full object-cover"/>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-xl text-white">{barber.name}</h3><p className="mt-1 text-sm text-neutral-400">{barber.experience_years} years of experience</p></div><span className="flex items-center gap-1 text-sm text-[var(--accent-color)]" aria-label={`Rated ${Number(barber.rating).toFixed(1)} out of 5`}><Star size={15} fill="currentColor"/>{Number(barber.rating).toFixed(1)}</span></div>
      <div className="mt-4 flex flex-wrap gap-2">{specialties.map((item) => <span key={item} className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-300">{item}</span>)}</div>
      <Link className="mt-5 inline-flex items-center gap-2 text-sm text-[var(--accent-color)]" to={`/barbers/${encodeURIComponent(barber.id)}`}>Meet {barber.name.split(" ")[0]} <ArrowUpRight size={15}/></Link>
    </div>
  </article>;
}

export function ReviewCard({ review }: { review: PublicReview }) {
  return <article className="content-card p-6"><div className="flex items-center gap-3">
    <Image src={review.customer_avatar_url} alt="" className="h-11 w-11 rounded-full object-cover"/>
    <div><h3 className="text-sm font-semibold text-white">{review.customer_name}</h3><p className="text-xs text-neutral-500">{new Date(review.created_at).toLocaleDateString()}</p></div>
  </div><p className="mt-4 text-[var(--accent-color)]" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(Math.max(0, Math.min(5, review.rating)))}<span className="sr-only">{review.rating} out of 5</span></p><p className="mt-3 text-sm leading-6 text-neutral-300">{review.comment || "A great visit."}</p></article>;
}

export function readSpecialties(value: string): string[] {
  try { const result: unknown = JSON.parse(value); if (Array.isArray(result)) return result.filter((item): item is string => typeof item === "string"); }
  catch { /* Keep older comma-separated entries readable. */ }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
