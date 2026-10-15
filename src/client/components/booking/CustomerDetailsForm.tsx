import type { AuthUser } from "../../../shared/auth";

export function CustomerDetailsForm({ user, note, onNoteChange }: { user: AuthUser | null; note: string; onNoteChange(value: string): void }) {
  if (!user) return <div className="rounded-2xl border border-amber-200/20 bg-amber-200/5 p-5 text-sm text-neutral-300">Sign in as a customer before confirming. Your selected service, barber, date and time will be saved on this device.<br/><span className="mt-2 inline-block text-neutral-500">Customer information is taken from your account.</span></div>;
  return <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[.035] p-5 sm:grid-cols-2">
    <p><span className="block text-xs text-neutral-500">Name</span><strong>{user.name}</strong></p><p><span className="block text-xs text-neutral-500">Email</span><strong>{user.email}</strong></p>
    <p><span className="block text-xs text-neutral-500">Phone</span><strong>{user.phone || "Not provided"}</strong></p>
    <label className="sm:col-span-2"><span className="mb-2 block text-sm text-neutral-300">Note for the barber (optional)</span><textarea value={note} maxLength={1000} rows={3} onChange={(event) => onNoteChange(event.target.value)} className="form-input resize-y" placeholder="Anything the barber should know?"/></label>
  </div>;
}
