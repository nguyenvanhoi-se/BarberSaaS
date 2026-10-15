import { Facebook, Instagram, MapPin, Phone, AtSign, Music2 } from "lucide-react";
import type { PublicShop } from "../api/public-api";
import { SectionTitle } from "./States";
import { OpeningHours } from "./OpeningHours";

const socials = [["facebook_url", "Facebook", Facebook], ["instagram_url", "Instagram", Instagram], ["tiktok_url", "TikTok", Music2]] as const;

export function ContactSection({ shop, compact = false }: { shop: PublicShop; compact?: boolean }) {
  const settings = shop.settings;
  const links = socials.flatMap(([key, label, Icon]) => {
    const href = safeExternalUrl(settings[key]);
    return href ? [{ key, label, Icon, href }] : [];
  });
  const mapUrl = safeExternalUrl(settings.google_maps_url);
  return <section id="contact" className="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
    <div>{!compact && <SectionTitle eyebrow="Find us" title="Visit the shop" description="Questions or ready to book? Get in touch and we'll take care of you."/>}
      <div className="space-y-5">
        {shop.address && <p className="flex gap-3 text-sm leading-6 text-neutral-300"><MapPin className="mt-1 shrink-0 text-[var(--accent-color)]" size={18}/>{shop.address}</p>}
        {shop.phone && <a className="flex gap-3 text-sm text-neutral-300 hover:text-white" href={`tel:${shop.phone}`}><Phone className="text-[var(--accent-color)]" size={18}/>{shop.phone}</a>}
        {shop.email && <a className="flex gap-3 text-sm text-neutral-300 hover:text-white" href={`mailto:${shop.email}`}><AtSign className="text-[var(--accent-color)]" size={18}/>{shop.email}</a>}
        {links.length > 0 && <div className="flex flex-wrap gap-3 pt-1">{links.map(({ key, label, Icon, href }) => <a key={key} href={href} target="_blank" rel="noreferrer" aria-label={label} className="icon-button"><Icon size={18}/></a>)}</div>}
        {mapUrl && <a className="button button-outline mt-3" href={mapUrl} target="_blank" rel="noreferrer">View on Google Maps</a>}
      </div>
    </div>
    <div><OpeningHours value={settings.opening_hours} compact/></div>
  </section>;
}

function safeExternalUrl(value?: string): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; }
  catch { return null; }
}
