import { RotateCw } from "lucide-react";

export function BookingError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="rounded-xl border border-red-300/20 bg-red-950/20 p-4 text-sm text-red-100" role="alert"><p>{message}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-2 inline-flex items-center gap-2 underline"><RotateCw size={14}/>Try again</button>}</div>;
}
