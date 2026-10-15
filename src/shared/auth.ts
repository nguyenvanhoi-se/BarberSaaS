export const USER_ROLES = [
  "SUPER_ADMIN",
  "SHOP_OWNER",
  "BARBER",
  "CUSTOMER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url?: string | null;
  role: UserRole;
  shop_id: string | null;
};

export type AuthEnvelope<T> = {
  success: true;
  data: T;
  meta: { requestId: string };
};

export type RegisterInput = {
  name: string;
  email: string;
  phone?: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};
