import type { AuthUser, LoginInput, RegisterInput } from "../../shared/auth";
import type { CurrentSession } from "../types/app";
import { AuthRepository, type SessionRow } from "../repositories/auth.repository";
import { createOpaqueToken, hashPassword, sha256Hex, verifyPassword } from "../utils/crypto";
import { AppError } from "../utils/app-error";

export const SESSION_COOKIE = "__Host-barbersaas_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const DUMMY_PASSWORD_HASH = "pbkdf2-sha256$210000$c2VjdXJlLWR1bW15LXNhbHQ$AaxuS2tXGEgodqDHPNSh-tNrBoo6ny5MrRHu9Op2NTk";

function cleanUser(user: Pick<SessionRow, "user_id" | "user_shop_id" | "name" | "email" | "phone" | "avatar_url" | "role">): AuthUser {
  return { id: user.user_id, name: user.name, email: user.email, phone: user.phone, avatar_url:user.avatar_url, role: user.role, shop_id: user.user_shop_id };
}

function createSession(userId: string, shopId: string | null, tokenHash: string): CurrentSession {
  return {
    id: crypto.randomUUID(), userId, shopId, tokenHash,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function registerCustomer(repository: AuthRepository, shopId: string, input: RegisterInput): Promise<{ user: AuthUser; token: string }> {
  const email = input.email.trim().toLowerCase();
  if (await repository.findByEmail(email, shopId)) throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists");
  const user = await repository.createCustomer({
    id: crypto.randomUUID(), shopId, name: input.name.trim(), email,
    phone: input.phone?.trim() || null, passwordHash: await hashPassword(input.password),
  });
  const token = createOpaqueToken();
  await repository.createSession(createSession(user.id, shopId, await sha256Hex(token)));
  return { user, token };
}

export async function login(repository: AuthRepository, emailInput: string, input: LoginInput, shopId: string | null): Promise<{ user: AuthUser; token: string }> {
  const email = emailInput.trim().toLowerCase();
  const account = await repository.findLoginUser(email, shopId);
  const validPassword = await verifyPassword(input.password, account?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!account || account.status !== "ACTIVE" || !validPassword) throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  const user: AuthUser = { id: account.id, name: account.name, email: account.email, phone: account.phone, avatar_url:account.avatar_url, role: account.role, shop_id: account.shop_id };
  const token = createOpaqueToken();
  await repository.createSession(createSession(user.id, user.shop_id, await sha256Hex(token)));
  return { user, token };
}

export async function refreshSession(repository: AuthRepository, old: CurrentSession): Promise<{ user: AuthUser; token: string }> {
  const token = createOpaqueToken();
  const session = createSession(old.userId, old.shopId, await sha256Hex(token));
  if (!(await repository.rotateSession(old.id, session))) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const row = await repository.findSession(session.tokenHash);
  if (!row) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  return { user: cleanUser(row), token };
}

export function cookieHeader(token: string, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function expiredCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
