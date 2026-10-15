import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use YYYY-MM-DD");
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, "Use HH:mm");

export const availableSlotsQuerySchema = z.object({
  date: dateSchema,
  service_id: z.string().trim().min(1).max(128),
  barber_id: z.string().trim().min(1).max(128).optional(),
}).strict();

export const createBookingSchema = z.object({
  service_id: z.string().trim().min(1).max(128),
  barber_id: z.string().trim().min(1).max(128).nullable().optional(),
  booking_date: dateSchema,
  start_time: timeSchema,
  note: z.string().trim().max(1000).nullable().optional(),
}).strict();

export const shopBookingFilterSchema = z.object({
  date: dateSchema.optional(),
  status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  barber_id: z.string().trim().min(1).max(128).optional(),
  customer_id: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const updateBookingStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
}).strict();

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ShopBookingFilters = z.infer<typeof shopBookingFilterSchema>;

