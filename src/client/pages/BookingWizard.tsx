import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ArrowLeft, ArrowRight, CalendarDays, LoaderCircle, X } from "lucide-react";
import { createCustomerBooking, getAvailableSlots, type AvailableSlot, type Booking } from "../api/booking-api";
import { getBarbers, getServices } from "../api/public-api";
import { useAuth } from "../auth/AuthContext";
import { BarberSelector } from "../components/booking/BarberSelector";
import { BookingProgress } from "../components/booking/BookingProgress";
import { BookingError } from "../components/booking/BookingError";
import { BookingSuccess } from "../components/booking/BookingSuccess";
import { BookingSummary } from "../components/booking/BookingSummary";
import { CustomerDetailsForm } from "../components/booking/CustomerDetailsForm";
import { DateSelector } from "../components/booking/DateSelector";
import { ServiceSelector } from "../components/booking/ServiceSelector";
import { TimeSlotSelector } from "../components/booking/TimeSlotSelector";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/States";
import { useCurrentShop } from "../tenant/ShopSite";
import { useTenantSeo } from "../tenant/useTenantSeo";

type WizardState = { serviceId: string | null; barberId: string | null; date: string; startTime: string | null; note: string };
const STORAGE_KEY = "barbersaas:booking-draft";
const safeTimeZone = (zone: string) => {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); return zone; }
  catch { return "Asia/Ho_Chi_Minh"; }
};
const todayInZone = (zone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch { return todayInZone("Asia/Ho_Chi_Minh"); }
};
const addCalendarDays = (date: string, days: number) => {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
function initialState(zone: string, serviceId: string | null, barberId: string | null): WizardState {
  try {
    const draft = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Partial<WizardState> | null;
    if (draft && typeof draft === "object") return {
      serviceId: typeof draft.serviceId === "string" ? draft.serviceId : null,
      barberId: typeof draft.barberId === "string" ? draft.barberId : null,
      date: typeof draft.date === "string" ? draft.date : todayInZone(zone),
      startTime: typeof draft.startTime === "string" ? draft.startTime : null,
      note: typeof draft.note === "string" ? draft.note.slice(0, 1000) : "",
    };
  } catch { /* Ignore an invalid local booking draft. */ }
  return { serviceId, barberId, date: todayInZone(zone), startTime: null, note: "" };
}
function apiMessage(error: unknown) {
  if (axios.isAxiosError<{ message?: string }>(error)) return error.response?.data?.message || "Unable to create this booking. Please try again.";
  return error instanceof Error ? error.message : "Unable to create this booking. Please try again.";
}

export function BookingWizard() {
  const shop = useCurrentShop();
  const zone = safeTimeZone(shop.settings.timezone || "Asia/Ho_Chi_Minh");
  const maxAdvance = Number(shop.settings.booking_advance_days);
  const maxDate = Number.isInteger(maxAdvance) && maxAdvance >= 0 ? addCalendarDays(todayInZone(zone), maxAdvance) : undefined;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser, isAuthenticated } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardState>(() => initialState(zone, searchParams.get("service"), searchParams.get("barber")));
  const [stepError, setStepError] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  useTenantSeo(shop, "Book an appointment");

  useEffect(() => { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form)); }, [form]);
  const services = useQuery({ queryKey: ["public", shop.id, "services"], queryFn: getServices });
  const barbers = useQuery({ queryKey: ["public", shop.id, "barbers"], queryFn: getBarbers });
  const chosenService = useMemo(() => services.data?.find((item) => item.id === form.serviceId) ?? null, [services.data, form.serviceId]);
  const chosenBarber = useMemo(() => barbers.data?.find((item) => item.id === form.barberId) ?? null, [barbers.data, form.barberId]);
  const slotsQuery = useQuery({
    queryKey: ["public", shop.id, "booking-slots", form.date, form.serviceId, form.barberId],
    queryFn: () => getAvailableSlots({ date: form.date, service_id: form.serviceId!, barber_id: form.barberId }),
    enabled: step >= 3 && step <= 5 && Boolean(form.date && form.serviceId), retry: false,
  });
  const create = useMutation({ mutationFn: createCustomerBooking, onSuccess: (result) => { setBooking(result); sessionStorage.removeItem(STORAGE_KEY); } });
  const selectedSlot = slotsQuery.data?.slots.find((slot) => slot.start_time === form.startTime && slot.available) ?? null;

  function update(patch: Partial<WizardState>) { setForm((current) => ({ ...current, ...patch })); setStepError(""); }
  function cancel() { sessionStorage.removeItem(STORAGE_KEY); navigate("/"); }
  function continueStep() {
    setStepError("");
    if (step === 0 && !chosenService) return setStepError("Choose a service to continue.");
    if (step === 2 && !form.date) return setStepError("Choose a date to continue.");
    if (step === 3 && !selectedSlot) return setStepError("Choose an available time to continue.");
    if (step === 4 && !isAuthenticated) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      return navigate("/login", { state: { from: { pathname: "/book" } } });
    }
    if (step < 5) setStep((current) => current + 1);
  }
  function confirm() {
    if (!chosenService || !form.startTime) return;
    if (!currentUser) return navigate("/login", { state: { from: { pathname: "/book" } } });
    if (currentUser.role !== "CUSTOMER") return navigate("/403");
    create.mutate({ service_id: chosenService.id, barber_id: form.barberId, booking_date: form.date, start_time: form.startTime, note: form.note });
  }

  return <main className="site-container max-w-5xl py-10 sm:py-14">
    <div className="mb-8 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-[var(--accent-color)]">Reserve your chair</p><h1 className="mt-2 font-display text-3xl text-white sm:text-4xl">Book an appointment</h1><p className="mt-2 text-sm text-neutral-400">Choose a service and time at {shop.name}.</p></div><button type="button" onClick={cancel} className="icon-button" aria-label="Cancel booking"><X size={19}/></button></div>
    {booking ? <BookingSuccess booking={booking} shop={shop}/> : <>
      <BookingProgress step={step}/>
      <section className="mt-9 min-h-[300px]" aria-live="polite">
        {step === 0 && <><SectionTitle eyebrow="Step 1" title="Choose a service" description="Select the service you'd like to book."/>{services.isPending ? <CardSkeleton/> : services.isError ? <ErrorState onRetry={() => { void services.refetch(); }}/> : services.data.length ? <ServiceSelector services={services.data} selected={form.serviceId} onSelect={(id) => update({ serviceId: id, startTime: null })}/> : <EmptyState title="No services available" message="This shop has not published services yet."/>}</>}
        {step === 1 && <><SectionTitle eyebrow="Step 2" title="Choose your barber" description="Choose a specific barber or let us find the first available."/>{barbers.isPending ? <CardSkeleton/> : barbers.isError ? <ErrorState onRetry={() => { void barbers.refetch(); }}/> : <BarberSelector barbers={barbers.data} selected={form.barberId} onSelect={(id) => update({ barberId: id, startTime: null })}/>}</>}
        {step === 2 && <><SectionTitle eyebrow="Step 3" title="Choose a date" description="Appointments use the shop's local timezone."/><DateSelector value={form.date} min={todayInZone(zone)} max={maxDate} timezone={zone} onChange={(date) => update({ date, startTime: null })}/></>}
        {step === 3 && <><SectionTitle eyebrow="Step 4" title="Choose an available time" description={chosenService ? `${chosenService.duration_minutes} minutes · ${form.date}` : "Choose a service first."}/><TimeSlotSelector slots={slotsQuery.data?.slots ?? []} selected={form.startTime} loading={slotsQuery.isPending} error={slotsQuery.isError} closed={slotsQuery.data?.shop_closed ?? false} onSelect={(slot: AvailableSlot) => update({ startTime: slot.start_time })} onRetry={() => { void slotsQuery.refetch(); }}/>{selectedSlot?.barber_name && form.barberId === null && <p className="mt-4 text-sm text-neutral-400">First available: <strong className="text-white">{selectedSlot.barber_name}</strong></p>}</>}
        {step === 4 && <><SectionTitle eyebrow="Step 5" title="Your details" description="Booking is attached to your signed-in customer account."/><CustomerDetailsForm user={currentUser?.role === "CUSTOMER" ? currentUser : null} note={form.note} onNoteChange={(note) => update({ note })}/>{!currentUser && <Link to="/login" state={{ from: { pathname: "/book" } }} className="mt-4 inline-flex items-center text-sm text-[var(--accent-color)]">Sign in to continue <ArrowRight className="ml-2" size={16}/></Link>}</>}
        {step === 5 && <><SectionTitle eyebrow="Step 6" title="Review and confirm" description="The shop will confirm your appointment shortly."/>{chosenService && <BookingSummary shopName={shop.name} service={chosenService} barber={chosenBarber} barberName={selectedSlot?.barber_name} date={form.date} time={form.startTime ?? ""} endTime={selectedSlot?.end_time} note={form.note}/>}</>}
      </section>
      {stepError && <p className="mt-5 text-sm text-amber-200" role="alert">{stepError}</p>}
      {create.isError && <div className="mt-5"><BookingError message={apiMessage(create.error)} onRetry={axios.isAxiosError(create.error) && create.error.response?.status === 409 ? () => { create.reset(); void slotsQuery.refetch(); setStep(3); } : undefined}/></div>}
      <div className="mt-10 flex flex-col-reverse gap-3 border-t border-white/10 pt-6 sm:flex-row sm:justify-between">
        <button type="button" onClick={() => step > 0 ? setStep((current) => current - 1) : cancel()} className="button button-outline"><ArrowLeft size={16}/>{step > 0 ? "Back" : "Cancel"}</button>
        {step < 5 ? <button type="button" onClick={continueStep} disabled={(step === 0 && (services.isPending || !services.data?.length)) || (step === 1 && (barbers.isPending || barbers.isError)) || (step === 3 && slotsQuery.isPending)} className="button button-primary">Continue <ArrowRight size={16}/></button> : <button type="button" onClick={confirm} disabled={create.isPending || !selectedSlot} className="button button-primary">{create.isPending ? <LoaderCircle className="animate-spin" size={17}/> : <CalendarDays size={17}/>}Confirm booking</button>}
      </div>
      {step === 5 && <p className="mt-3 text-center text-xs text-neutral-500">Your price and appointment duration are confirmed by the shop's service record.</p>}
    </>}
  </main>;
}
