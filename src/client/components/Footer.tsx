import { Link } from "react-router-dom";
import type { PublicShop } from "../api/public-api";
import { Image } from "./Image";
import { OpeningHours } from "./OpeningHours";

function socialLinks(settings: Record<string, string>) {
  return ([
    ["Facebook", settings.facebook_url],
    ["Instagram", settings.instagram_url],
    ["TikTok", settings.tiktok_url],
  ] as const).flatMap(([label, value]) => {
    if (!value) return [];
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? [{ label, href: url.href }] : [];
    } catch { return []; }
  });
}

export function Footer({ shop }: { shop: PublicShop }) {
  const socials = socialLinks(shop.settings);
  return <footer className="border-t border-white/10 bg-black/35">
    <div className="site-container grid gap-9 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_.8fr_1fr] lg:py-16">
      <div>{shop.logo_url && <Image src={shop.logo_url} alt={`${shop.name} logo`} className="mb-4 h-12 w-12 rounded-full object-cover"/>}<h2 className="font-display text-xl text-white">{shop.name}</h2><p className="mt-3 max-w-sm text-sm leading-6 text-neutral-400">{shop.description || shop.settings.hero_description || "A neighborhood barbershop for good cuts and good company."}</p></div>
      <div><h2 className="mb-4 font-display text-lg text-white">Explore</h2><div className="grid gap-3 text-sm text-neutral-400"><Link className="hover:text-white" to="/services">Services</Link><Link className="hover:text-white" to="/barbers">Our barbers</Link><Link className="hover:text-white" to="/gallery">Gallery</Link><Link className="hover:text-white" to="/contact">Contact</Link></div></div>
      <div><OpeningHours value={shop.settings.opening_hours} compact/>{socials.length > 0 && <div className="mt-6"><h2 className="mb-3 font-display text-lg text-white">Follow along</h2><div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-neutral-400">{socials.map((social) => <a key={social.label} href={social.href} target="_blank" rel="noreferrer" className="hover:text-white">{social.label}</a>)}</div></div>}</div>
    </div>
    <div className="border-t border-white/10"><div className="site-container flex flex-col gap-2 py-5 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} {shop.name}</p><p>{[shop.phone, shop.email, shop.address].filter(Boolean).join(" · ")}</p></div></div>
  </footer>;
}
