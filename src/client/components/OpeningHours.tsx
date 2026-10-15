import { Clock3 } from "lucide-react";
import { SectionTitle } from "./States";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type HoursEntry = string | { open?: string; close?: string; closed?: boolean } | null;

function readHours(value?: string): Record<string, HoursEntry> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, HoursEntry>;
  } catch { /* Invalid or legacy values are displayed as unset. */ }
  return {};
}

function displayHours(entry: HoursEntry | undefined): string {
  if (typeof entry === "string" && entry.trim()) return entry;
  if (entry === null || (typeof entry === "object" && entry?.closed)) return "Closed";
  if (typeof entry === "object" && entry?.open && entry.close) return `${entry.open} – ${entry.close}`;
  return "Hours not set";
}

export function OpeningHours({ value, compact = false }: { value?: string; compact?: boolean }) {
  const hours = readHours(value);
  return <section aria-labelledby="opening-hours-heading">
    {!compact && <SectionTitle eyebrow="Plan your visit" title="Opening hours" description="We look forward to seeing you."/>}
    {compact && <h2 id="opening-hours-heading" className="mb-4 font-display text-lg text-white">Opening hours</h2>}
    <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
      {!compact && <div className="mb-4 flex items-center gap-2 text-[var(--accent-color)]"><Clock3 size={17}/><span className="text-sm font-medium">Weekly schedule</span></div>}
      <dl className="space-y-3">{DAYS.map((day) => <div key={day} className="flex justify-between gap-4 border-b border-white/[.07] pb-2 last:border-0 last:pb-0"><dt className="text-sm text-neutral-300">{day}</dt><dd className="text-right text-sm text-neutral-400">{displayHours(hours[day] ?? hours[day.toLowerCase()])}</dd></div>)}</dl>
    </div>
  </section>;
}
