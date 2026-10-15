import { Image } from "./Image";
import type { PublicGalleryItem } from "../api/public-api";

export function GalleryGrid({ items }: { items: PublicGalleryItem[] }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <figure key={item.id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--secondary-color)]">
    <Image src={item.image_url} alt={item.title} className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"/>
    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5 pt-14"><p className="font-display text-lg text-white">{item.title}</p>{item.category && <p className="mt-1 text-xs uppercase tracking-widest text-[var(--accent-color)]">{item.category}</p>}</figcaption>
  </figure>)}</div>;
}
