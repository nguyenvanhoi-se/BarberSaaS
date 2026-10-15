import { UserRound } from "lucide-react";
import type { PublicBarber } from "../../api/public-api";
import { Image } from "../Image";

export function BarberSelector({ barbers, selected, onSelect }: { barbers: PublicBarber[]; selected: string | null; onSelect(id: string | null): void }) {
  const card = "content-card flex min-h-24 items-center gap-4 p-4 text-left transition hover:border-white/25";
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={`${card} ${selected === null ? "border-[var(--accent-color)] ring-1 ring-[var(--accent-color)]" : ""}`}><span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/10 text-[var(--accent-color)]"><UserRound/></span><span><strong className="block text-white">Any Barber</strong><span className="text-sm text-neutral-400">First available barber</span></span></button>
    {barbers.map((barber) => <button type="button" key={barber.id} aria-pressed={selected === barber.id} onClick={() => onSelect(barber.id)} className={`${card} ${selected === barber.id ? "border-[var(--accent-color)] ring-1 ring-[var(--accent-color)]" : ""}`}><Image src={barber.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover"/><span><strong className="block text-white">{barber.name}</strong><span className="text-sm text-neutral-400">{barber.experience_years} years · ★ {Number(barber.rating).toFixed(1)}</span></span></button>)}
  </div>;
}
