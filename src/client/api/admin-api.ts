import { apiClient } from "../lib/api-client";

type Envelope<T>={success:true;data:T};
const unwrap=<T>(response:{data:Envelope<T>})=>response.data.data;
export type Page<T>={items:T[];page:number;limit:number;total:number};
export async function adminGet<T>(path:string){return unwrap(await apiClient.get<Envelope<T>>(path));}
export async function adminPost<T>(path:string,data:unknown){return unwrap(await apiClient.post<Envelope<T>>(path,data));}
export async function adminPut<T>(path:string,data:unknown){return unwrap(await apiClient.put<Envelope<T>>(path,data));}
export async function adminPatch<T>(path:string,data:unknown){return unwrap(await apiClient.patch<Envelope<T>>(path,data));}
export async function adminDelete<T>(path:string){return unwrap(await apiClient.delete<Envelope<T>>(path));}
export type BookingRow={id:string;booking_code:string;customer_name:string;customer_email:string;customer_phone:string|null;service_name:string;barber_name:string;booking_date:string;start_time:string;end_time:string;duration_minutes:number;total_price:number;note:string|null;status:"PENDING"|"CONFIRMED"|"COMPLETED"|"CANCELLED"|"NO_SHOW";created_at:string};
