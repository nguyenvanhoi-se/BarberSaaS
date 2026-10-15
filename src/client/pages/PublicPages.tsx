import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBarberById, getBarbers, getGallery, getReviews, getServices } from "../api/public-api";
import { BarberCard, ReviewCard, ServiceCard, readSpecialties } from "../components/Cards";
import { ContactSection } from "../components/ContactSection";
import { GalleryGrid } from "../components/GalleryGrid";
import { Image } from "../components/Image";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/States";
import { useCurrentShop } from "../tenant/ShopSite";
import { useTenantSeo } from "../tenant/useTenantSeo";
import { BookingWizard } from "./BookingWizard";

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <section className="page-intro"><div className="site-container py-16 sm:py-20"><p className="text-xs font-bold uppercase tracking-[.25em] text-[var(--accent-color)]">{eyebrow}</p><h1 className="mt-4 max-w-3xl font-display text-4xl text-white sm:text-5xl">{title}</h1>{description && <p className="mt-4 max-w-2xl leading-7 text-neutral-400">{description}</p>}</div></section>;
}

export function ServicesPage() {
  const shop = useCurrentShop();
  useTenantSeo(shop, "Services");
  const query = useQuery({ queryKey: ["public", shop.id, "services"], queryFn: getServices });
  return <><PageIntro eyebrow="The menu" title="Services & pricing" description={`Take a look through the services available at ${shop.name}.`}/><section className="site-container py-12 sm:py-16">{query.isPending ? <CardSkeleton/> : query.isError ? <ErrorState onRetry={() => { void query.refetch(); }}/> : query.data.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{query.data.map((service) => <ServiceCard key={service.id} service={service}/>)}</div> : <EmptyState title="No services listed yet" message="This shop is updating its menu. Please check back soon."/>}</section></>;
}

export function BarbersPage() {
  const shop = useCurrentShop();
  useTenantSeo(shop, "Barbers");
  const query = useQuery({ queryKey: ["public", shop.id, "barbers"], queryFn: getBarbers });
  return <><PageIntro eyebrow="The team" title="Meet the barbers" description="Get to know the people behind the chair."/><section className="site-container py-12 sm:py-16">{query.isPending ? <CardSkeleton/> : query.isError ? <ErrorState onRetry={() => { void query.refetch(); }}/> : query.data.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{query.data.map((barber) => <BarberCard key={barber.id} barber={barber}/>)}</div> : <EmptyState title="No barber profiles yet" message="Check back soon to meet the team."/>}</section></>;
}

export function BarberDetailPage() {
  const shop = useCurrentShop();
  const { id = "" } = useParams();
  const query = useQuery({ queryKey: ["public", shop.id, "barber", id], queryFn: () => getBarberById(id), enabled: Boolean(id) });
  useTenantSeo(shop, query.data?.name || "Barber profile", query.data?.bio || undefined);
  if (query.isPending) return <section className="site-container py-16"><CardSkeleton count={1}/></section>;
  if (query.isError) return <section className="site-container py-16"><ErrorState title="Barber not found" onRetry={() => { void query.refetch(); }}/><Link to="/barbers" className="mt-6 inline-block text-[var(--accent-color)]">Back to all barbers</Link></section>;
  const barber = query.data;
  return <section className="site-container grid gap-9 py-14 sm:py-20 lg:grid-cols-2 lg:items-center"><Image src={barber.avatar_url} alt={barber.name} className="aspect-[4/3] w-full rounded-3xl border border-white/10 object-cover"/><div><p className="text-xs font-bold uppercase tracking-[.25em] text-[var(--accent-color)]">Meet the barber</p><h1 className="mt-4 font-display text-4xl text-white sm:text-5xl">{barber.name}</h1><p className="mt-3 text-sm text-neutral-400">{barber.experience_years} years of experience · {Number(barber.rating).toFixed(1)} / 5 ({barber.review_count} reviews)</p><p className="mt-6 leading-7 text-neutral-300">{barber.bio || "A skilled barber ready to help you find your look."}</p><div className="mt-5 flex flex-wrap gap-2">{readSpecialties(barber.specialties).map((specialty) => <span key={specialty} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-neutral-300">{specialty}</span>)}</div><Link to={`/book?barber=${encodeURIComponent(barber.id)}`} className="button button-primary mt-8">Book with {barber.name.split(" ")[0]}</Link></div></section>;
}

export function GalleryPage() {
  const shop = useCurrentShop();
  useTenantSeo(shop, "Gallery");
  const query = useQuery({ queryKey: ["public", shop.id, "gallery"], queryFn: getGallery });
  const [category, setCategory] = useState("All");
  const categories = useMemo(() => ["All", ...new Set((query.data ?? []).flatMap((item) => item.category ? [item.category] : []))], [query.data]);
  const filtered = query.data?.filter((item) => category === "All" || item.category === category) ?? [];
  return <><PageIntro eyebrow="Inside the shop" title="A little inspiration" description="A few favorite moments from the barbershop."/><section className="site-container py-12 sm:py-16">{query.isPending ? <CardSkeleton/> : query.isError ? <ErrorState onRetry={() => { void query.refetch(); }}/> : !query.data.length ? <EmptyState title="The gallery is getting ready" message="Photos from this shop will appear here."/> : <><div className="mb-7 flex flex-wrap gap-2" aria-label="Filter gallery by category">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`rounded-full border px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)] ${category === item ? "border-[var(--accent-color)] bg-[var(--accent-color)] text-black" : "border-white/15 text-neutral-300"}`}>{item}</button>)}</div>{filtered.length ? <GalleryGrid items={filtered}/> : <EmptyState title="Nothing in this category yet" message="Choose another category to see more photos."/>}</>}</section></>;
}

export function AboutPage() {
  const shop = useCurrentShop();
  useTenantSeo(shop, "About", shop.description || undefined);
  return <><PageIntro eyebrow="Our story" title={shop.name} description={shop.description || shop.settings.hero_description || "A local barbershop with a focus on craftsmanship, hospitality, and a great experience in the chair."}/><section className="site-container grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.1fr_.9fr] lg:items-center"><div><SectionTitle eyebrow="Made for the neighborhood" title="Come as you are. Leave feeling sharp."/><p className="leading-7 text-neutral-300">{shop.description || "We believe a good haircut starts with a good conversation. Our barbers take time to understand what works for you and make every visit feel easy."}</p><Link className="button button-primary mt-7" to="/book">Book now</Link></div><div className="overflow-hidden rounded-3xl border border-white/10"><Image src={shop.cover_url} alt={`${shop.name} interior`} className="aspect-[4/3] w-full object-cover"/></div></section><section className="section-band"><div className="site-container py-14 sm:py-20"><ContactSection shop={shop}/></div></section></>;
}

export function ContactPage() {
  const shop = useCurrentShop();
  useTenantSeo(shop, "Contact");
  return <><PageIntro eyebrow="Get in touch" title="Find your way to us" description="Call, email, or drop by. We'd be happy to see you."/><section className="site-container py-12 sm:py-16"><ContactSection shop={shop}/></section></>;
}

export function ReviewsPageSection({ compact = false }: { compact?: boolean }) {
  const shop = useCurrentShop();
  const query = useQuery({ queryKey: ["public", shop.id, "reviews"], queryFn: getReviews });
  if (!compact) return <><PageIntro eyebrow="Guest notes" title="Reviews"/><section className="site-container py-12">{reviewContent(query)}</section></>;
  return <section>{reviewContent(query)}</section>;
}

function reviewContent(query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getReviews>>>>) {
  if (query.isPending) return <CardSkeleton count={2}/>;
  if (query.isError) return <ErrorState onRetry={() => { void query.refetch(); }}/>;
  if (!query.data.length) return <EmptyState title="No reviews yet" message="Guest reviews will appear here when available."/>;
  const average = query.data.reduce((sum, review) => sum + review.rating, 0) / query.data.length;
  return <><div className="mb-7 rounded-2xl border border-white/10 bg-white/[.035] p-5"><strong className="font-display text-3xl text-white">{average.toFixed(1)}</strong><span className="ml-3 text-[var(--accent-color)]">★★★★★</span><p className="mt-1 text-sm text-neutral-400">Average rating from {query.data.length} {query.data.length === 1 ? "review" : "reviews"}</p></div><div className="grid gap-5 md:grid-cols-2">{query.data.map((review, index) => <ReviewCard key={`${review.created_at}-${index}`} review={review}/>)}</div></>;
}

export function BookPage() {
  return <BookingWizard/>;
}

export function PublicNotFoundPage() {
  const shop = useCurrentShop();
  useTenantSeo(shop, "Page not found");
  return <section className="site-container py-24 text-center"><p className="text-xs font-bold uppercase tracking-[.25em] text-[var(--accent-color)]">404</p><h1 className="mt-4 font-display text-4xl text-white">This page isn't here</h1><Link to="/" className="button button-outline mt-7">Back to home</Link></section>;
}
