import { Hono } from "hono";
import type { AppEnv } from "../types/app";
import { AppError } from "../utils/app-error";

/** No provider adapter is enabled yet. In particular, this route never trusts an unsigned body. */
export const paymentWebhookRoutes = new Hono<AppEnv>().post("/:provider", (context) => {
  const provider = context.req.param("provider").toLowerCase();
  const configured = context.env.PAYMENT_ENABLED?.toLowerCase() === "true" &&
    context.env.PAYMENT_PROVIDER?.toLowerCase() === provider && provider !== "none";
  if (!configured) throw new AppError(503, "PAYMENT_NOT_CONFIGURED", "Payment provider is not configured.");
  // Deploy is intentionally blocked for Stripe/VNPay until a signature-verifying adapter exists.
  throw new AppError(503, "PAYMENT_PROVIDER_NOT_CONFIGURED", "Payment provider webhook verification is not configured.");
});
