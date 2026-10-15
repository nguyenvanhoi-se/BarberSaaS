import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/app";
import { errorResponse } from "../utils/http-response";

export type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export function rateLimit(
  binding: (environment: AppEnv["Bindings"]) => RateLimitBinding | undefined,
  scope: string,
): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    // The Cloudflare API enforces these rules on its network; local bindings otherwise distort integration tests.
    if (context.env.APP_ENV !== "production") return next();
    const limiter = binding(context.env);
    if (!limiter) {
      return errorResponse(context, 503, "Service is not configured", { code: "SERVICE_MISCONFIGURED" });
    }

    const clientAddress = context.req.header("CF-Connecting-IP");
    if (!clientAddress) {
      return errorResponse(context, 503, "Request could not be safely evaluated", { code: "RATE_LIMIT_UNAVAILABLE" });
    }
    try {
      const result = await limiter.limit({ key: `${scope}:${clientAddress ?? "local"}` });
      if (!result.success) {
        context.header("Retry-After", "60");
        context.header("Cache-Control", "no-store");
        return errorResponse(context, 429, "Too many requests. Please try again shortly.", { code: "RATE_LIMITED" });
      }
    } catch {
      return errorResponse(context, 503, "Request protection is temporarily unavailable", { code: "RATE_LIMIT_UNAVAILABLE" });
    }
    await next();
  };
}
