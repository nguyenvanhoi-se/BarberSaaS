import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/app";

export function getAllowedOrigins(environment: AppEnv["Bindings"]): Set<string> {
  const origins = (environment.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (environment.APP_ENV === "development") {
    origins.push("http://localhost:5173", "http://127.0.0.1:5173");
  }

  return new Set(origins);
}

export function isAllowedRequestOrigin(environment: AppEnv["Bindings"], origin: string, requestOrigin: string): boolean {
  if (origin === requestOrigin) return true;
  return getAllowedOrigins(environment).has(origin);
}

export const corsMiddleware = createMiddleware<AppEnv>(async (context, next) => {
  const allowedOrigins = getAllowedOrigins(context.env);
  const middleware = cors({
    origin: (origin) => (allowedOrigins.has(origin) ? origin : ""),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "X-Request-Id", "Idempotency-Key"],
    exposeHeaders: ["X-Request-Id"],
    credentials: true,
    maxAge: 600,
  });

  return middleware(context, next);
});
