import { CardSkeleton, EmptyState, ErrorState } from "../States";
import type { AvailableSlot } from "../../api/booking-api";

export function TimeSlotSelector({ slots, selected, loading, error, closed, onSelect, onRetry }: { slots: AvailableSlot[]; selected: string | null; loading: boolean; error: boolean; closed: boolean; onSelect(slot: AvailableSlot): void; onRetry(): void }) {
  if (loading) return <CardSkeleton count={2}/>;
  if (error) return <ErrorState title="Unable to load available times" onRetry={onRetry}/>;
  const available = slots.filter((slot) => slot.available);
  if (!available.length) return <EmptyState title={closed ? "Shop closed" : "No available times"} message={closed ? "This shop is closed on the selected date." : "Choose another date or barber to see open slots."}/>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Available time slots">
    {slots.map((slot) => <button type="button" key={`${slot.start_time}-${slot.barber_id ?? "none"}`} disabled={!slot.available} onClick={() => onSelect(slot)} aria-pressed={selected === slot.start_time} className={`min-h-12 rounded-xl border px-3 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)] ${!slot.available ? "cursor-not-allowed border-white/[.06] text-neutral-600" : selected === slot.start_time ? "border-[var(--accent-color)] bg-[var(--accent-color)] text-black" : "border-white/15 bg-white/[.035] text-white hover:border-[var(--accent-color)]"}`}>{slot.start_time}</button>)}
  </div>;
}
