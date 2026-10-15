import { Hono } from "hono";
import type { AppEnv } from "../types/app";
import { healthRoutes } from "./health.routes";
import { authRoutes } from "./auth.routes";
import { publicRoutes } from "./public.routes";
import { shopRoutes } from "./shop.routes";
import { customerRoutes } from "./customer.routes";
import { superAdminRoutes } from "./super-admin.routes";
import { mediaRoutes } from "./media.routes";
import { planRoutes } from "./plan.routes";
import { paymentWebhookRoutes } from "./payment-webhook.routes";

export const apiRoutes = new Hono<AppEnv>()
  .route("/health", healthRoutes)
  .route("/webhooks/payment", paymentWebhookRoutes)
  .route("/plans", planRoutes)
  .route("/media", mediaRoutes)
  .route("/auth", authRoutes)
  .route("/public", publicRoutes)
  .route("/shop", shopRoutes)
  .route("/customer", customerRoutes)
  .route("/super-admin", superAdminRoutes);
