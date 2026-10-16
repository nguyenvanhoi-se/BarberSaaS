import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, MapPin, Star } from "lucide-react";
import { getBarbers, getGallery, getReviews, getServices } from "../api/public-api";
import { BarberCard, ReviewCard, ServiceCard } from "../components/Cards";
import { ContactSection } from "../components/ContactSection";
import { GalleryGrid } from "../components/GalleryGrid";
import { Image } from "../components/Image";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/States";
import { useCurrentShop } from "../tenant/ShopSite";
import { useTenantSeo } from "../tenant/useTenantSeo";

export function HomePage() {
  const shop = useCurrentShop();
  const services = useQuery({ queryKey: ["public", shop.id, "services"], queryFn: getServices });
  const barbers = useQuery({ queryKey: ["public", shop.id, "barbers"], queryFn: getBarbers });
  const gallery = useQuery({ queryKey: ["public", shop.id, "gallery"], queryFn: getGallery });
  const reviews = useQuery({ queryKey: ["public", shop.id, "reviews"], queryFn: getReviews });
  useTenantSeo(shop, undefined, shop.settings.hero_description || shop.description || undefined);

  return <>
    <section className="hero-section">
      <Image src={shop.settings.hero_image || shop.cover_url} alt="" loading="eager" fallbackSrc="/images/barbershop-hero.svg" className="hero-image"/>
      <div className="hero-overlay"/>
      <div className="site-container relative z-10 grid min-h-[620px] items-center py-24 lg:min-h-[720px]">
        <div className="max-w-3xl"><p className="mb-5 text-xs font-bold uppercase tracking-[.28em] text-[var(--accent-color)]">{shop.address || "A cut above the rest"}</p>
          <h1 className="font-display text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">{shop.settings.hero_title || shop.name}</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-neutral-200 sm:text-lg">{shop.settings.hero_description || shop.description || "Thoughtful cuts, timeless craft, and a chair saved just for you."}</p>
          <div className="mt-9 flex flex-wrap gap-3"><Link className="button button-primary" to="/book">Book an appointment <ArrowRight size={17}/></Link><Link className="button button-outline" to="/services">View services</Link></div>
          <a className="mt-12 inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white" href="#welcome">Discover the shop <ArrowDown size={15}/></a>
        </div>
      </div>
      <div className="hero-edge"/>
    </section>

    <section id="welcome" className="site-container grid gap-10 py-20 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:py-28">
      <div><SectionTitle eyebrow="Welcome in" title="Good grooming. Great company."/><p className="max-w-xl leading-7 text-neutral-400">{shop.description || shop.settings.hero_description || "A neighborhood barbershop built around good conversation, attention to detail, and the confidence that comes with a great cut."}</p><div className="mt-7 flex flex-wrap gap-4"><Link to="/about" className="text-sm font-semibold text-[var(--accent-color)]">More about us <ArrowRight className="ml-2 inline" size={15}/></Link>{shop.address && <span className="flex items-center gap-2 text-sm text-neutral-500"><MapPin size={15}/>{shop.address}</span>}</div></div>
      <div className="relative overflow-hidden rounded-3xl border border-white/10"><Image src={shop.cover_url} alt={`${shop.name} shop`} fallbackSrc="/images/barbershop-hero.svg" className="aspect-[16/10] w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent"/></div>
    </section>

    <section className="section-band"><div className="site-container py-20 lg:py-24"><SectionTitle eyebrow="The menu" title="Services made for you" description="From a quick tidy-up to a full refresh, take a look at what we offer."/><FeaturedServices query={services}/><div className="mt-8"><Link to="/services" className="text-sm font-semibold text-[var(--accent-color)]">All services <ArrowRight className="ml-2 inline" size={15}/></Link></div></div></section>
    <section className="site-container py-20 lg:py-24"><SectionTitle eyebrow="The team" title="Meet your barbers" description="Skilled hands, good people, and a sharp eye for the details."/><FeaturedBarbers query={barbers}/></section>
    <section className="section-band"><div className="site-container py-20 lg:py-24"><SectionTitle eyebrow="In the chair" title="The shop, in moments"/><FeaturedGallery query={gallery}/><div className="mt-8"><Link to="/gallery" className="text-sm font-semibold text-[var(--accent-color)]">Explore the gallery <ArrowRight className="ml-2 inline" size={15}/></Link></div></div></section>
    <section className="site-container py-20 lg:py-24"><SectionTitle eyebrow="From our guests" title="Good words travel"/><ReviewSummary query={reviews}/></section>
    <section className="section-band"><div className="site-container py-20 lg:py-24"><ContactSection shop={shop}/></div></section>
    <section className="site-container py-16"><div className="rounded-3xl border border-[var(--accent-color)]/30 bg-gradient-to-br from-[var(--secondary-color)] to-black px-6 py-12 text-center sm:px-12"><p className="text-xs font-bold uppercase tracking-[.25em] text-[var(--accent-color)]">Your chair is waiting</p><h2 className="mt-4 font-display text-3xl text-white sm:text-4xl">Make time for a great cut.</h2><Link className="button button-primary mt-7" to="/book">Book now</Link></div></section>
  </>;
}

function FeaturedServices({ query }: { query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getServices>>>> }) {
  if (query.isPending) return <CardSkeleton/>;
  if (query.isError) return <ErrorState onRetry={() => { void query.refetch(); }}/>;
  if (!query.data.length) return <EmptyState title="Services are being updated" message="Please check back soon for this shop's service menu."/>;
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{query.data.slice(0, 3).map((service) => <ServiceCard key={service.id} service={service}/>)}</div>;
}

function FeaturedBarbers({ query }: { query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getBarbers>>>> }) {
  if (query.isPending) return <CardSkeleton/>;
  if (query.isError) return <ErrorState onRetry={() => { void query.refetch(); }}/>;
  if (!query.data.length) return <EmptyState title="Our team is growing" message="Barber profiles will be here soon."/>;
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{query.data.slice(0, 3).map((barber) => <BarberCard key={barber.id} barber={barber}/>)}</div>;
}

function FeaturedGallery({ query }: { query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getGallery>>>> }) {
  if (query.isPending) return <CardSkeleton/>;
  if (query.isError) return <ErrorState onRetry={() => { void query.refetch(); }}/>;
  if (!query.data.length) return <EmptyState title="A look inside the shop" message="Photos from the shop will appear here."/>;
  return <GalleryGrid items={query.data.slice(0, 3)}/>;
}

function ReviewSummary({ query }: { query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getReviews>>>> }) {
  if (query.isPending) return <CardSkeleton count={2}/>;
  if (query.isError) return <ErrorState onRetry={() => { void query.refetch(); }}/>;
  if (!query.data.length) return <EmptyState title="The first review is on its way" message="Guest reviews will appear here once they're available."/>;
  const average = query.data.reduce((total, review) => total + review.rating, 0) / query.data.length;
  return <><div className="mb-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[.04] px-5 py-3"><Star className="text-[var(--accent-color)]" fill="currentColor" size={18}/><strong className="text-white">{average.toFixed(1)} / 5</strong><span className="text-sm text-neutral-400">{query.data.length} {query.data.length === 1 ? "review" : "reviews"}</span></div><div className="grid gap-5 md:grid-cols-2">{query.data.slice(0, 2).map((review, index) => <ReviewCard key={`${review.created_at}-${index}`} review={review}/>)}</div></>;
}
