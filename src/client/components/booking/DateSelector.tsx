export function DateSelector({ value, min, max, onChange, timezone }: { value: string; min: string; max?: string; onChange(value: string): void; timezone: string }) {
  return <div className="max-w-md rounded-2xl border border-white/10 bg-white/[.035] p-5">
    <label htmlFor="booking-date" className="mb-3 block text-sm font-medium text-neutral-200">Choose a date</label>
    <input id="booking-date" type="date" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} className="form-input"/>
    <p className="mt-3 text-xs text-neutral-500">Times use the shop timezone: {timezone}.</p>
  </div>;
}
