import type { RequestIdVariables } from "hono/request-id";
import type { AuthUser } from "../../shared/auth";
import type { Bindings } from "./bindings";

export type TenantContext = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  plan: "BASIC" | "PRO" | "PREMIUM";
};

export type CurrentSession = {
  id: string;
  userId: string;
  shopId: string | null;
  tokenHash: string;
  expiresAt: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: RequestIdVariables & {
    currentTenant?: TenantContext;
    currentTenantId?: string;
    currentUser?: AuthUser;
    currentSession?: CurrentSession;
  };
};
