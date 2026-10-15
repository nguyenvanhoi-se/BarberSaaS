import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/app";
import { isAllowedRequestOrigin } from "./cors";
import { errorResponse } from "../utils/http-response";

/** Browser-origin check for cookie-authenticated APIs; non-browser server clients may omit Origin. */
export const originGuard = createMiddleware<AppEnv>(async (context, next) => {
  const origin = context.req.header("Origin");
  if (origin) {
    let requestOrigin: string;
    try { requestOrigin = new URL(context.req.url).origin; }
    catch { return errorResponse(context, 400, "Invalid request", { code: "INVALID_ORIGIN" }); }
    if (!isAllowedRequestOrigin(context.env, origin, requestOrigin)) {
      return errorResponse(context, 403, "Request origin is not allowed", { code: "ORIGIN_NOT_ALLOWED" });
    }
  }
  await next();
});
