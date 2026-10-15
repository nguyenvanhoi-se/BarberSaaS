import type { AuthUser } from "../../shared/auth";
import { BookingRepository, type BarberScheduleRow, type BusyInterval } from "../repositories/booking.repository";
import type { CreateBookingInput } from "../validators/booking";
import { AppError } from "../utils/app-error";

type HoursValue = string | { open?: string; close?: string; closed?: boolean } | null;
type ShopHours = Record<string, HoursValue>;
type Slot = { start_time: string; end_time: string; available: boolean; barber_id: string | null; barber_name: string | null };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CONFLICT_MESSAGE = "Khung giờ này vừa được đặt bởi khách khác.";

function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) throw new AppError(422, "INVALID_DATE", "Date must use YYYY-MM-DD");
  const [year, month, day] = match.slice(1).map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) {
    throw new AppError(422, "INVALID_DATE", "Date is not a valid calendar date");
  }
  return { year, month, day, weekday: value.getUTCDay() };
}

function validTime(value: string | null | undefined): number | null {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function timeString(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeZone(settings: Record<string, string>) {
  const candidate = settings.timezone || "Asia/Ho_Chi_Minh";
  try { new Intl.DateTimeFormat("en", { timeZone: candidate }).format(); return candidate; }
  catch { return "Asia/Ho_Chi_Minh"; }
}

function localParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

function validateBookingDate(date: string, settings: Record<string, string>) {
  const parsed = parseDate(date);
  const now = localParts(new Date(), timeZone(settings));
  if (date < now.date) throw new AppError(422, "PAST_DATE", "Choose a date that has not passed");
  const advanceDays = Number(settings.booking_advance_days);
  if (Number.isInteger(advanceDays) && advanceDays >= 0) {
    const max = new Date(`${now.date}T00:00:00Z`);
    max.setUTCDate(max.getUTCDate() + advanceDays);
    if (date > max.toISOString().slice(0, 10)) throw new AppError(422, "DATE_TOO_FAR", "This date is outside the booking window");
  }
  return { ...parsed, now };
}

function readShopHours(raw?: string): ShopHours | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as ShopHours;
  } catch { /* Legacy/plain text is ignored unless it explicitly says closed. */ }
  return null;
}

function dayHours(hours: ShopHours | null, weekday: number) {
  if (!hours) return { closed: false as const, start: null as number | null, end: null as number | null };
  const raw = hours[DAY_NAMES[weekday]] ?? hours[DAY_NAMES[weekday].toLowerCase()];
  if (raw === undefined) return { closed: false as const, start: null as number | null, end: null as number | null };
  if (raw === null || (typeof raw === "object" && raw.closed)) return { closed: true as const, start: null, end: null };
  let open: string | undefined;
  let close: string | undefined;
  if (typeof raw === "object") { open = raw.open; close = raw.close; }
  else {
    const match = /(?:^|\s)(\d{2}:\d{2})\s*(?:-|–|to)\s*(\d{2}:\d{2})(?:$|\s)/iu.exec(raw);
    if (/closed/i.test(raw)) return { closed: true as const, start: null, end: null };
    open = match?.[1]; close = match?.[2];
  }
  const start = validTime(open); const end = validTime(close);
  return { closed: false as const, start, end };
}

function scheduleBounds(row: BarberScheduleRow, shopBounds: ReturnType<typeof dayHours>) {
  if (row.day_off || !row.start_time || !row.end_time || shopBounds.closed) return null;
  const start = validTime(row.start_time); const end = validTime(row.end_time);
  if (start === null || end === null || end <= start) return null;
  const boundedStart = shopBounds.start === null ? start : Math.max(start, shopBounds.start);
  const boundedEnd = shopBounds.end === null ? end : Math.min(end, shopBounds.end);
  return boundedEnd > boundedStart ? { start: boundedStart, end: boundedEnd } : null;
}

function intervalFree(start: number, end: number, busy: BusyInterval[]) {
  return busy.every((booking) => {
    const busyStart = validTime(booking.start_time) ?? 0;
    const busyEnd = validTime(booking.end_time) ?? 0;
    return start >= busyEnd || end <= busyStart;
  });
}

function makeSlots(input: {
  date: string; duration: number; schedules: BarberScheduleRow[]; busy: BusyInterval[];
  settings: Record<string, string>; weekday: number; barberId?: string;
}) {
  const shopHours = dayHours(readShopHours(input.settings.opening_hours), input.weekday);
  const active = input.schedules.flatMap((row) => {
    const bounds = scheduleBounds(row, shopHours);
    return bounds ? [{ row, ...bounds }] : [];
  });
  const intervalRaw = Number(input.settings.slot_interval_minutes);
  const interval = Number.isInteger(intervalRaw) && intervalRaw >= 5 && intervalRaw <= 120 ? intervalRaw : 30;
  const today = localParts(new Date(), timeZone(input.settings));
  const starts = new Set<number>();
  for (const barber of active) {
    for (let start = barber.start; start + input.duration <= barber.end; start += interval) starts.add(start);
  }
  const slots: Slot[] = [...starts].sort((a, b) => a - b).flatMap((start): Slot[] => {
    const end = start + input.duration;
    const candidates = active.filter((barber) => barber.start <= start && barber.end >= end
      && (!input.barberId || barber.row.id === input.barberId)
      && intervalFree(start, end, input.busy.filter((item) => item.barber_id === barber.row.id))
      && (input.date !== today.date || timeString(start) > today.time))
      .sort((a, b) => a.row.id.localeCompare(b.row.id));
    const chosen = candidates[0]?.row;
    if (input.barberId && !chosen) {
      const requested = active.find((item) => item.row.id === input.barberId)?.row;
      return [{ start_time: timeString(start), end_time: timeString(end), available: false, barber_id: requested?.id ?? input.barberId, barber_name: requested?.name ?? null }];
    }
    return [{ start_time: timeString(start), end_time: timeString(end), available: Boolean(chosen), barber_id: chosen?.id ?? null, barber_name: chosen?.name ?? null }];
  });
  return { slots, shopClosed: shopHours.closed };
}

export async function availableBookingSlots(repository: BookingRepository, shopId: string, input: { date: string; service_id: string; barber_id?: string }) {
  const service = await repository.service(shopId, input.service_id);
  if (!service) throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
  const settings = await repository.settingMap(shopId);
  const date = validateBookingDate(input.date, settings);
  if (input.barber_id && !(await repository.barber(shopId, input.barber_id))) throw new AppError(404, "BARBER_NOT_FOUND", "Barber not found");
  const scheduleResult = await repository.schedules(shopId, date.weekday, input.barber_id);
  const schedules = scheduleResult.results;
  const busyResult = await repository.busyIntervals(shopId, input.date, schedules.map((row) => row.id));
  const result = makeSlots({ date: input.date, duration: service.duration_minutes, schedules, busy: busyResult.results, settings, weekday: date.weekday, barberId: input.barber_id });
  return { date: input.date, timezone: timeZone(settings), service: { id: service.id, name: service.name, duration_minutes: service.duration_minutes }, shop_closed: result.shopClosed, slots: result.slots };
}

export async function createBooking(repository: BookingRepository, shopId: string, user: AuthUser, input: CreateBookingInput, monthlyLimit:number|null=null) {
  const service = await repository.service(shopId, input.service_id);
  if (!service) throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
  const settings = await repository.settingMap(shopId);
  const date = validateBookingDate(input.booking_date, settings);
  const requestedBarberId = input.barber_id ?? undefined;
  if (requestedBarberId && !(await repository.barber(shopId, requestedBarberId))) throw new AppError(404, "BARBER_NOT_FOUND", "Barber not found");
  const scheduleResult = await repository.schedules(shopId, date.weekday, requestedBarberId);
  const schedules = scheduleResult.results;
  const shopBounds = dayHours(readShopHours(settings.opening_hours), date.weekday);
  if (shopBounds.closed) throw new AppError(409, "SHOP_CLOSED", "Shop is closed on this date");
  const start = validTime(input.start_time);
  if (start === null) throw new AppError(422, "INVALID_TIME", "Choose a valid appointment time");
  if (input.booking_date === date.now.date && input.start_time <= date.now.time) throw new AppError(422, "PAST_TIME", "Choose a time that has not passed");
  const intervalRaw = Number(settings.slot_interval_minutes);
  const slotInterval = Number.isInteger(intervalRaw) && intervalRaw >= 5 && intervalRaw <= 120 ? intervalRaw : 30;
  const workingSchedules = schedules.flatMap((row) => {
    const bounds = scheduleBounds(row, shopBounds);
    return bounds ? [{ row, bounds }] : [];
  });
  if (!workingSchedules.length) throw new AppError(409, "BARBER_UNAVAILABLE", "No barber is scheduled to work on this date");
  const withinHours = workingSchedules.filter(({ bounds }) => start >= bounds.start && start + service.duration_minutes <= bounds.end);
  if (!withinHours.length) {
    throw new AppError(422, "OUTSIDE_WORKING_HOURS", "Selected time is outside the available working hours");
  }
  const candidates = withinHours.filter(({ bounds }) => (start - bounds.start) % slotInterval === 0)
    .map(({ row }) => row).sort((a, b) => a.id.localeCompare(b.id));
  if (!candidates.length) throw new AppError(422, "INVALID_SLOT", "Selected time is not a valid booking slot");
  const busy = (await repository.busyIntervals(shopId, input.booking_date, candidates.map((row) => row.id))).results;
  const available = candidates.filter((candidate) => intervalFree(start, start + service.duration_minutes, busy.filter((item) => item.barber_id === candidate.id)));
  if (!available.length) throw new AppError(409, "BOOKING_CONFLICT", CONFLICT_MESSAGE);

  for (const barber of available) {
    const now=new Date(),monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString().slice(0,10),monthEnd=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString().slice(0,10);
    const id = crypto.randomUUID();
    const bookingCode = `BK-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    const created = await repository.createAtomically({
      id, shopId, code: bookingCode, customerId: user.id, barberId: barber.id,
      serviceId: service.id, date: input.booking_date, start: input.start_time,
      end: timeString(start + service.duration_minutes), price: service.price,
      note: input.note?.trim() || null, userId: user.id,
      monthlyLimit,monthStart,monthEnd,
    });
    if (created) {
      const booking = await repository.customerBooking(shopId, user.id, id);
      if (!booking) throw new AppError(500, "BOOKING_READ_FAILED", "Booking was created but could not be loaded");
      return booking;
    }
  }
  if(monthlyLimit!==null){const now=new Date(),monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString().slice(0,10),monthEnd=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString().slice(0,10);const usage=await repository.bookingCountForMonth(shopId,monthStart,monthEnd);if(usage>=monthlyLimit)throw new AppError(403,"PLAN_LIMIT_REACHED","You have reached the monthly booking limit for your current plan.");}
  throw new AppError(409, "BOOKING_CONFLICT", CONFLICT_MESSAGE);
}

function toWallMinutes(date: string, time: string) {
  const { year, month, day } = parseDate(date);
  const minutes = validTime(time);
  if (minutes === null) return Number.NaN;
  return Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60) / 60_000;
}

export async function cancelCustomerBooking(repository: BookingRepository, shopId: string, user: AuthUser, bookingId: string) {
  const booking = await repository.customerBooking(shopId, user.id, bookingId);
  if (!booking) throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  if (booking.status === "CANCELLED") throw new AppError(409, "BOOKING_ALREADY_CANCELLED", "Booking is already cancelled");
  if (booking.status === "COMPLETED" || booking.status === "NO_SHOW") throw new AppError(409, "BOOKING_NOT_CANCELLABLE", "This booking can no longer be cancelled");
  const settings = await repository.settingMap(shopId);
  const localNow = localParts(new Date(), timeZone(settings));
  const bookingWall = toWallMinutes(booking.booking_date, booking.start_time);
  const nowWall = toWallMinutes(localNow.date, localNow.time);
  if (bookingWall <= nowWall) throw new AppError(409, "BOOKING_IN_PAST", "A booking that has started cannot be cancelled");
  const cancellationHours = Number(settings.cancellation_window_hours);
  const requiredMinutes = Number.isFinite(cancellationHours) && cancellationHours > 0 ? cancellationHours * 60 : 0;
  if (bookingWall - nowWall < requiredMinutes) throw new AppError(409, "CANCELLATION_WINDOW", "This booking is within the cancellation window");
  const changed = await repository.updateStatus({ shopId, bookingId, from: booking.status, to: "CANCELLED", userId: user.id, userRole: user.role });
  if (!changed) throw new AppError(409, "BOOKING_STATE_CHANGED", "Booking status changed; refresh and try again");
  return repository.customerBooking(shopId, user.id, bookingId);
}

const TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [], CANCELLED: [], NO_SHOW: [],
};

export async function changeBookingStatus(repository: BookingRepository, shopId: string, user: AuthUser, bookingId: string, nextStatus: string) {
  const existing = await repository.bookingForStatus(shopId, bookingId, user);
  if (!existing) throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  if (!TRANSITIONS[existing.status]?.includes(nextStatus)) throw new AppError(422, "INVALID_STATUS_TRANSITION", `Cannot change booking from ${existing.status} to ${nextStatus}`);
  const updated = await repository.updateStatus({ shopId, bookingId, from: existing.status, to: nextStatus, userId: user.id, userRole: user.role });
  if (!updated) throw new AppError(409, "BOOKING_STATE_CHANGED", "Booking status changed; refresh and try again");
  return repository.bookingForStatus(shopId, bookingId, user);
}
