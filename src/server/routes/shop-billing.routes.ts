import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/app";
import { BillingService } from "../billing/BillingService";
import { BillingRepository, type BillingPageQuery } from "../repositories/billing.repository";
import { PlanService } from "../services/plan.service";
import { AppError } from "../utils/app-error";
import { successResponse } from "../utils/http-response";

export const shopBillingRoutes = new Hono<AppEnv>();
const id = z.string().trim().min(1).max(200);
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20), status: z.string().trim().max(20).optional(), search: z.string().trim().max(100).optional() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(422, "VALIDATION_ERROR", "Request data is invalid", result.error.issues.map((issue) => ({ code: "INVALID_VALUE", message: issue.message, field: issue.path.join(".") })));
  return result.data;
}
function tenantId(context: import("hono").Context<AppEnv>) {
  const tenant = context.get("currentTenant");
  const user = context.get("currentUser");
  if (!tenant || !user || user.role !== "SHOP_OWNER" || user.shop_id !== tenant.id) throw new AppError(403, "FORBIDDEN", "Shop owner access required");
  return { tenantId: tenant.id, userId: user.id };
}
function billingQuery(context: import("hono").Context<AppEnv>): BillingPageQuery {
  const query = parse(listSchema, context.req.query());
  return { ...query, status: query.status };
}

shopBillingRoutes.get("/config", (context) => successResponse(context, new BillingService(context.env.DB, context.env).paymentConfiguration()));
shopBillingRoutes.get("/subscription", async (context) => {
  const { tenantId: shopId } = tenantId(context);
  return successResponse(context, await new PlanService(context.env.DB).getBilling(shopId));
});
shopBillingRoutes.get("/usage", async (context) => {
  const { tenantId: shopId } = tenantId(context);
  const service = new PlanService(context.env.DB);
  const [subscription, usage] = await Promise.all([service.getBilling(shopId), service.getUsage(shopId)]);
  return successResponse(context, { subscription, plan: subscription.effective_plan, usage });
});
shopBillingRoutes.post("/checkout", async (context) => {
  const { tenantId: shopId, userId } = tenantId(context);
  const body = parse(z.object({ plan: z.enum(["BASIC", "PRO", "PREMIUM"]), billing_interval: z.enum(["MONTHLY", "YEARLY"]) }).strict(), await context.req.json());
  const idempotencyKey = context.req.header("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(idempotencyKey)) throw new AppError(422, "VALIDATION_ERROR", "A valid Idempotency-Key header is required.");
  const url = new URL(context.req.url);
  return successResponse(context, await new BillingService(context.env.DB, context.env).createCheckout(
    shopId, userId, body.plan, body.billing_interval, idempotencyKey,
    new URL("/admin/billing/payment-result", url).toString(), new URL("/admin/billing?payment=cancelled", url).toString(),
  ), 201);
});
shopBillingRoutes.get("/payments", async (context) => {
  const { tenantId: shopId } = tenantId(context);
  return successResponse(context, await new BillingRepository(context.env.DB).paymentsForShop(shopId, billingQuery(context)));
});
shopBillingRoutes.get("/payments/:id", async (context) => {
  const { tenantId: shopId } = tenantId(context);
  const paymentId = parse(id, context.req.param("id"));
  const payment = await new BillingRepository(context.env.DB).paymentForShop(shopId, paymentId);
  if (!payment) throw new AppError(404, "NOT_FOUND", "Payment not found");
  return successResponse(context, payment);
});
shopBillingRoutes.get("/invoices", async (context) => {
  const { tenantId: shopId } = tenantId(context);
  return successResponse(context, await new BillingRepository(context.env.DB).invoicesForShop(shopId, billingQuery(context)));
});
shopBillingRoutes.get("/invoices/:id", async (context) => {
  const { tenantId: shopId } = tenantId(context);
  const invoiceId = parse(id, context.req.param("id"));
  const invoice = await new BillingRepository(context.env.DB).invoiceForShop(shopId, invoiceId);
  if (!invoice) throw new AppError(404, "NOT_FOUND", "Invoice not found");
  return successResponse(context, invoice);
});
shopBillingRoutes.post("/cancel", async (context) => {
  const { tenantId: shopId, userId } = tenantId(context);
  parse(z.object({}).strict(), await context.req.json());
  return successResponse(context, await new BillingService(context.env.DB, context.env).cancelAtPeriodEnd(shopId, userId));
});
shopBillingRoutes.post("/plan-change", async (context) => {
  const { tenantId: shopId, userId } = tenantId(context);
  const body = parse(z.object({ plan: z.enum(["BASIC", "PRO", "PREMIUM"]), billing_interval: z.enum(["MONTHLY", "YEARLY"]) }).strict(), await context.req.json());
  return successResponse(context, await new BillingService(context.env.DB, context.env).schedulePlanChange(shopId, userId, body.plan, body.billing_interval));
});
