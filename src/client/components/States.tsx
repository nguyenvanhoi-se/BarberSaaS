import { Link } from "react-router-dom";

export function SectionTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return <div className="mb-9 max-w-2xl">
    {eyebrow && <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[var(--accent-color)]">{eyebrow}</p>}
    <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
    {description && <p className="mt-3 text-neutral-400">{description}</p>}
  </div>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.03] px-6 py-12 text-center">
    <p className="font-display text-xl text-white">{title}</p><p className="mt-2 text-sm text-neutral-400">{message}</p>
  </div>;
}

export function ErrorState({ onRetry, title = "We couldn't load this section" }: { onRetry: () => void; title?: string }) {
  return <div className="rounded-2xl border border-red-300/20 bg-red-950/20 px-6 py-10 text-center" role="alert">
    <p className="font-display text-xl text-white">{title}</p><p className="mt-2 text-sm text-neutral-300">Please check your connection and try again.</p>
    <button className="button button-outline mt-5" onClick={onRetry}>Try again</button>
  </div>;
}

export function TenantSkeleton() {
  return <main className="min-h-screen bg-[var(--primary-color)] p-6" aria-label="Loading shop">
    <div className="mx-auto max-w-6xl animate-pulse"><div className="h-10 w-48 rounded bg-white/10"/><div className="mt-28 h-80 rounded-3xl bg-white/10"/><div className="mt-10 h-12 w-2/3 rounded bg-white/10"/></div>
  </main>;
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading content">{Array.from({ length: count }, (_, index) => <div key={index} className="animate-pulse overflow-hidden rounded-2xl border border-white/10"><div className="aspect-[4/3] bg-white/10"/><div className="space-y-3 p-5"><div className="h-5 w-2/3 rounded bg-white/10"/><div className="h-4 w-full rounded bg-white/10"/></div></div>)}</div>;
}

export function ShopNotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-[var(--primary-color)] px-6 text-center text-white"><div><p className="text-xs font-bold uppercase tracking-[.3em] text-[var(--accent-color)]">404</p><h1 className="mt-4 font-display text-4xl">Shop not found</h1><p className="mt-3 text-neutral-400">There isn't a barbershop configured for this address.</p><Link to="/" className="button button-primary mt-7">Try again</Link></div></main>;
}

export function ShopStatusPage({ status }: { status: "SUSPENDED" | "INACTIVE" }) {
  const suspended = status === "SUSPENDED";
  return <main className="flex min-h-screen items-center justify-center bg-[var(--primary-color)] px-6 text-center text-white"><div className="max-w-lg"><p className="text-xs font-bold uppercase tracking-[.3em] text-[var(--accent-color)]">{suspended ? "Temporarily unavailable" : "Not active"}</p><h1 className="mt-4 font-display text-4xl">{suspended ? "This shop is temporarily paused" : "This shop is not currently open online"}</h1><p className="mt-4 text-neutral-400">Please check back later or contact the shop directly.</p></div></main>;
}
