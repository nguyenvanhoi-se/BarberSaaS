import { createMiddleware } from "hono/factory";
import type { UserRole } from "../../shared/auth";
import type { AppEnv } from "../types/app";
import { AuthRepository } from "../repositories/auth.repository";
import { isPlatformHost } from "../services/tenant.service";
import { sha256Hex } from "../utils/crypto";
import { AppError } from "../utils/app-error";

export const requireAuth = createMiddleware<AppEnv>(async (context, next) => {
  context.header("Cache-Control", "private, no-store");
  const token = getCookie(context.req.raw.headers.get("Cookie"), "__Host-barbersaas_session");
  if (!token) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const repository = new AuthRepository(context.env.DB);
  const session = await repository.findSession(await sha256Hex(token));
  if (!session) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");

  const sessionShopId = session.shop_id;
  const userShopId = session.user_shop_id;
  if (session.role === "SUPER_ADMIN") {
    if (sessionShopId !== null || userShopId !== null || !isPlatformHost(context) || context.get("currentTenant")) {
      throw new AppError(401, "INVALID_SESSION_SCOPE", "Session is not valid for this host");
    }
  } else if (!context.get("currentTenant") || sessionShopId !== context.get("currentTenant")?.id || userShopId !== context.get("currentTenant")?.id) {
    throw new AppError(401, "INVALID_SESSION_SCOPE", "Session is not valid for this shop");
  }
  if (session.role !== "SUPER_ADMIN" && context.get("currentTenant")?.status !== "ACTIVE") {
    throw new AppError(403, "SHOP_UNAVAILABLE", "This shop is not currently available");
  }

  context.set("currentUser", {
    id: session.user_id,
    name: session.name,
    email: session.email,
    phone: session.phone,
    avatar_url:session.avatar_url,
    role: session.role,
    shop_id: userShopId,
  });
  context.set("currentSession", {
    id: session.session_id,
    userId: session.user_id,
    shopId: sessionShopId,
    tokenHash: session.token_hash,
    expiresAt: session.expires_at,
  });
  await next();
});

export function requireRole(...roles: UserRole[]) {
  return createMiddleware<AppEnv>(async (context, next) => {
    const user = context.get("currentUser");
    if (!user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    if (!roles.includes(user.role)) throw new AppError(403, "FORBIDDEN", "You do not have permission to access this resource");
    await next();
  });
}

export function getCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}
