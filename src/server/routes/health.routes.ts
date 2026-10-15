import { Hono } from "hono";
import type { AppEnv } from "../types/app";
import { successResponse } from "../utils/http-response";
import { errorResponse } from "../utils/http-response";

export const healthRoutes = new Hono<AppEnv>().get("/", (context) =>
  successResponse(context, { status: "ok", version: context.env.APP_VERSION ?? "unknown" }),
);

healthRoutes.get("/ready", async (context) => {
  try {
    await context.env.DB.prepare("SELECT 1 AS ready").first<{ ready: number }>();
    if (!context.env.MEDIA_BUCKET) throw new Error("Storage binding is unavailable");
    return successResponse(context, { status: "ready", checks: { database: "ok", media_storage: "bound" } });
  } catch {
    return errorResponse(context, 503, "Service is not ready", { code: "DEPENDENCY_UNAVAILABLE" });
  }
});
