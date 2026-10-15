import type { PublicBarber, PublicService } from "../../api/public-api";

export function BookingSummary({ shopName, service, barber, barberName, date, time, endTime, note }: { shopName: string; service: PublicService; barber: PublicBarber | null; barberName?: string | null; date: string; time: string; endTime?: string; note?: string }) {
  const formattedDate = new Date(`${date}T12:00:00Z`).toLocaleDateString("vi-VN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return <dl className="grid gap-4 rounded-2xl border border-white/10 bg-white/[.035] p-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><dt className="text-xs text-neutral-500">Shop</dt><dd className="mt-1 font-medium text-white">{shopName}</dd></div>
    <div><dt className="text-xs text-neutral-500">Service</dt><dd className="mt-1 font-medium text-white">{service.name} · {service.duration_minutes} min</dd></div>
    <div><dt className="text-xs text-neutral-500">Barber</dt><dd className="mt-1 font-medium text-white">{barber?.name || barberName || "Any available barber"}</dd></div>
    <div><dt className="text-xs text-neutral-500">Date</dt><dd className="mt-1 font-medium capitalize text-white">{formattedDate}</dd></div>
    <div><dt className="text-xs text-neutral-500">Time</dt><dd className="mt-1 font-medium text-white">{time}{endTime ? ` – ${endTime}` : ""}</dd></div>
    <div><dt className="text-xs text-neutral-500">Price</dt><dd className="mt-1 font-semibold text-[var(--accent-color)]">{service.price.toLocaleString("vi-VN")} ₫</dd></div>
    {note && <div className="sm:col-span-2"><dt className="text-xs text-neutral-500">Note</dt><dd className="mt-1 text-sm text-neutral-300">{note}</dd></div>}
  </dl>;
}
