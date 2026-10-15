import type { PublicService } from "../../api/public-api";
import { Image } from "../Image";

export function ServiceSelector({ services, selected, onSelect }: { services: PublicService[]; selected: string | null; onSelect(id: string): void }) {
  return <div className="grid gap-4 sm:grid-cols-2">{services.map((service) => <button type="button" key={service.id} onClick={() => onSelect(service.id)} aria-pressed={selected === service.id} className={`content-card flex min-h-32 items-center gap-4 p-4 text-left transition hover:border-white/25 ${selected === service.id ? "border-[var(--accent-color)] ring-1 ring-[var(--accent-color)]" : ""}`}>
    <Image src={service.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover"/><span className="min-w-0 flex-1"><strong className="block text-white">{service.name}</strong><span className="mt-1 block line-clamp-2 text-sm text-neutral-400">{service.description || `${service.duration_minutes} minutes`}</span><span className="mt-2 block text-sm font-semibold text-[var(--accent-color)]">{service.price.toLocaleString("vi-VN")} ₫ · {service.duration_minutes} min</span></span>
  </button>)}</div>;
}
