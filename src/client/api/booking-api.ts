import { apiClient } from "../lib/api-client";

type ApiResponse<T> = { success: true; data: T; meta: { requestId: string } };
export type AvailableSlot = { start_time: string; end_time: string; available: boolean; barber_id: string | null; barber_name: string | null };
export type SlotResponse = { date: string; timezone: string; service: { id: string; name: string; duration_minutes: number }; shop_closed: boolean; slots: AvailableSlot[] };
export type Booking = {
  id: string; shop_id: string; booking_code: string; customer_id: string; customer_name: string;
  customer_email: string; customer_phone: string | null; barber_id: string; barber_name: string;
  service_id: string; service_name: string; duration_minutes: number; booking_date: string;
  start_time: string; end_time: string; total_price: number; note: string | null;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  created_at: string; updated_at: string;
  review?: { id: string; rating: number; comment: string | null; status: string; created_at: string } | null;
};

async function data<T>(promise: Promise<{ data: ApiResponse<T> }>) { return (await promise).data.data; }

export function getAvailableSlots(input: { date: string; service_id: string; barber_id: string | null }) {
  const query = new URLSearchParams({ date: input.date, service_id: input.service_id });
  if (input.barber_id) query.set("barber_id", input.barber_id);
  return data(apiClient.get< ApiResponse<SlotResponse> >(`/public/booking/available-slots?${query.toString()}`));
}

export function createCustomerBooking(input: { service_id: string; barber_id: string | null; booking_date: string; start_time: string; note: string }) {
  return data(apiClient.post<ApiResponse<Booking>>("/customer/bookings", input));
}

export function getCustomerBookings() {
  return data(apiClient.get<ApiResponse<Booking[]>>("/customer/bookings"));
}

export function getCustomerBooking(id: string) {
  return data(apiClient.get<ApiResponse<Booking>>(`/customer/bookings/${encodeURIComponent(id)}`));
}

export function cancelCustomerBooking(id: string) {
  return data(apiClient.patch<ApiResponse<Booking>>(`/customer/bookings/${encodeURIComponent(id)}/cancel`));
}

export function submitCustomerReview(id: string,input:{rating:number;comment:string}) {
  return data(apiClient.post<ApiResponse<NonNullable<Booking["review"]>>>(`/customer/bookings/${encodeURIComponent(id)}/review`,input));
}
