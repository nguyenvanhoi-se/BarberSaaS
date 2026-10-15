import { apiClient } from "../lib/api-client";

type ApiResponse<T> = { success: true; data: T; meta: { requestId: string } };

export type ShopStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";
export type PublicShop = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  canonical_domain?: string | null;
  logo_url: string | null;
  cover_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  description: string | null;
  status: ShopStatus;
  settings: Record<string, string>;
};

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  image_url: string | null;
};

export type PublicBarber = {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  experience_years: number;
  specialties: string;
  rating: number;
  review_count: number;
};

export type PublicGalleryItem = {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  category: string | null;
};

export type PublicReview = {
  customer_name: string;
  customer_avatar_url: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};

async function get<T>(path: string): Promise<T> {
  const response = await apiClient.get<ApiResponse<T>>(path);
  return response.data.data;
}

export const getCurrentShop = () => get<PublicShop>("/public/shop");
export const getServices = () => get<PublicService[]>("/public/services");
export const getBarbers = () => get<PublicBarber[]>("/public/barbers");
export const getBarberById = (id: string) => get<PublicBarber>(`/public/barbers/${encodeURIComponent(id)}`);
export const getGallery = () => get<PublicGalleryItem[]>("/public/gallery");
export const getReviews = () => get<PublicReview[]>("/public/reviews");
