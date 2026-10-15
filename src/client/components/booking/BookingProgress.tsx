const STEPS = ["Service", "Barber", "Date", "Time", "Details", "Confirm"];

export function BookingProgress({ step }: { step: number }) {
  return <ol aria-label="Booking progress" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
    {STEPS.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-xs sm:flex-col sm:items-start sm:gap-1 sm:px-4 ${index === step ? "border-[var(--accent-color)] bg-[var(--accent-color)]/10 text-white" : index < step ? "border-white/15 text-neutral-300" : "border-white/[.07] text-neutral-500"}`}><span className="font-bold">{String(index + 1).padStart(2, "0")}</span><span>{label}</span></li>)}
  </ol>;
}
