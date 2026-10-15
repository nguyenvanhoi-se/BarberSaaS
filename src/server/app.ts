import { Hono } from "hono";
import type { AppEnv } from "./types/app";
import { corsMiddleware } from "./middleware/cors";
import { handleError } from "./middleware/error-handler";
import { securityHeaders } from "./middleware/security-headers";
import { apiRoutes } from "./routes";
import { seoRoutes } from "./routes/seo.routes";
import { errorResponse } from "./utils/http-response";
import { productionConfiguration } from "./services/production-config";
import { originGuard } from "./middleware/origin-guard";

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", async (context, next) => {
    const id = crypto.randomUUID();
    context.set("requestId", id);
    await next();
    context.header("X-Request-Id", id);
    if (context.env.APP_ENV === "production" && new URL(context.req.url).protocol === "https:") {
      context.header("Strict-Transport-Security", "max-age=31536000");
    }
  });
  app.use("*", securityHeaders);
  app.use("*", async (context, next) => {
    const invalid = productionConfiguration(context.env);
    if (invalid && context.req.path !== "/api/health") return errorResponse(context, 503, "Missing required production configuration.", { code: "SERVICE_MISCONFIGURED" });
    const declaredLength = Number(context.req.header("Content-Length"));
    const maxBytes = context.req.path === "/api/shop/media" ? 32 * 1024 * 1024
      : context.req.path === "/api/auth/avatar" ? 6 * 1024 * 1024
        : 1024 * 1024;
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      context.header("Cache-Control", "no-store");
      return errorResponse(context, 413, "Request body is too large", { code: "PAYLOAD_TOO_LARGE" });
    }
    const isPublicImage = context.req.path.startsWith("/api/media/") || /^\/api\/public\/gallery\/[^/]+\/image$/u.test(context.req.path);
    if (context.req.path.startsWith("/api/") && !isPublicImage) context.header("Cache-Control", "no-store");
    if (context.req.path.startsWith("/api/auth/") || context.req.path.startsWith("/api/shop/") || context.req.path.startsWith("/api/customer/") || context.req.path.startsWith("/api/super-admin/")) context.header("Cache-Control", "private, no-store");
    await next();
  });
  app.use("/api/*", corsMiddleware);
  app.use("/api/*", originGuard);

  app.use("*", async (context, next) => {
    const started = Date.now();
    await next();
    console.log(JSON.stringify({
      event: "http.request",
      requestId: context.get("requestId"),
      method: context.req.method,
      path: new URL(context.req.url).pathname,
      status: context.res.status,
      durationMs: Date.now() - started,
      shopId: context.get("currentTenantId") ?? null,
      userId: context.get("currentUser")?.id ?? null,
    }));
  });

  app.route("/api", apiRoutes);
  app.route("/", seoRoutes);
  app.onError(handleError);
  app.notFound((context) => {
    const isNavigation = context.req.header("Sec-Fetch-Mode") === "navigate" ||
      (context.req.header("Accept") ?? "").split(",").some((type) => type.trim().startsWith("text/html"));
    if (!context.req.path.startsWith("/api") && context.env.ASSETS &&
        ["GET", "HEAD"].includes(context.req.method) && isNavigation) {
      const shellUrl = new URL("/index.html", context.req.url);
      return context.env.ASSETS.fetch(new Request(shellUrl, {
        method: context.req.method,
        headers: context.req.raw.headers,
      }));
    }
    return errorResponse(context, 404, "Route not found", { code: "NOT_FOUND" });
  });


  return app;
}
