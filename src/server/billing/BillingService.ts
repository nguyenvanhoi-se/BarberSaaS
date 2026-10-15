import type { D1Database } from "@cloudflare/workers-types";
import { PLAN_CATALOG, type PlanId } from "../services/plan-catalog";
import { PlanService } from "../services/plan.service";
import { AppError } from "../utils/app-error";
import { BillingRepository } from "../repositories/billing.repository";
import { NoopProvider } from "./NoopProvider";
import type { BillingInterval, PaymentProvider } from "./PaymentProvider";
import { PaymentReconciliationService } from "./PaymentReconciliationService";

export class BillingService {
  readonly repository: BillingRepository;
  readonly provider: PaymentProvider;

  constructor(private readonly db: D1Database, private readonly environment: { PAYMENT_ENABLED?: string; PAYMENT_PROVIDER?: string; PAYMENT_CURRENCY?: string }) {
    this.repository = new BillingRepository(db);
    this.provider = new NoopProvider();
  }

  paymentConfiguration() {
    // No live adapter or catalog price is configured in this release.
    const provider = (this.environment.PAYMENT_PROVIDER ?? "none").toLowerCase();
    const enabled = this.environment.PAYMENT_ENABLED?.toLowerCase() === "true";
    const pricingAvailable = Object.values(PLAN_CATALOG).every((plan) => plan.monthlyPrice !== null && plan.yearlyPrice !== null);
    const configured = enabled && provider !== "none" && provider === this.provider.name && pricingAvailable;
    return { enabled: configured, provider: configured ? provider : null, currency: this.environment.PAYMENT_CURRENCY ?? "VND", status: configured ? "READY" as const : "NOT_CONFIGURED" as const };
  }

  async createCheckout(shopId: string, userId: string, plan: PlanId, interval: BillingInterval, _idempotencyKey: string, _successUrl: string, _cancelUrl: string) {
    const configuration = this.paymentConfiguration();
    if (!configuration.enabled) throw new AppError(503, "PAYMENT_NOT_CONFIGURED", "Online payment is not configured.");
    const planConfig = PLAN_CATALOG[plan];
    const amount = interval === "MONTHLY" ? planConfig.monthlyPrice : planConfig.yearlyPrice;
    if (amount === null) throw new AppError(503, "PRICING_NOT_CONFIGURED", "Plan pricing is not configured.");
    // Price and currency are sourced only from server configuration.
    const subscription = await new PlanService(this.db).getCurrentSubscription(shopId);
    if (!subscription) throw new AppError(402, "SUBSCRIPTION_REQUIRED", "This shop does not have a subscription.");
    await this.repository.audit(shopId, userId, "CHECKOUT_CREATED", "subscription", subscription.id, { plan, billing_interval: interval });
    throw new AppError(503, "PAYMENT_NOT_CONFIGURED", "Online payment is not configured.");
  }

  async cancelAtPeriodEnd(shopId: string, userId: string) {
    const subscription = await new PlanService(this.db).getCurrentSubscription(shopId);
    if (!subscription) throw new AppError(402, "SUBSCRIPTION_REQUIRED", "This shop does not have a subscription.");
    if (!subscription.expired_at) throw new AppError(409, "CANCELLATION_UNAVAILABLE", "This subscription has no billing period end date.");
    if (subscription.status === "CANCELLED" || subscription.status === "EXPIRED") throw new AppError(409, "SUBSCRIPTION_NOT_CANCELLABLE", "This subscription cannot be cancelled.");
    await this.repository.cancelAtPeriodEnd(shopId, subscription.id, userId);
    return new PlanService(this.db).getBilling(shopId);
  }

  async schedulePlanChange(shopId: string, userId: string, plan: PlanId, interval: BillingInterval) {
    const subscription = await new PlanService(this.db).getCurrentSubscription(shopId);
    if (!subscription) throw new AppError(402, "SUBSCRIPTION_REQUIRED", "This shop does not have a subscription.");
    const order: Record<PlanId, number> = { BASIC: 0, PRO: 1, PREMIUM: 2 };
    if (order[plan] >= order[subscription.plan]) {
      throw new AppError(503, "PAYMENT_NOT_CONFIGURED", "Upgrades require a configured payment provider.");
    }
    if (!subscription.expired_at || Date.parse(subscription.expired_at) <= Date.now()) {
      throw new AppError(409, "PLAN_CHANGE_UNAVAILABLE", "A downgrade can only be scheduled during an active billing period.");
    }
    await this.repository.schedulePlanChange(shopId, subscription.id, plan, interval, userId, subscription.plan, subscription.billing_interval);
    return new PlanService(this.db).getBilling(shopId);
  }

  async renewSubscription(_shopId: string): Promise<never> {
    if (!this.paymentConfiguration().enabled) throw new AppError(503, "PAYMENT_NOT_CONFIGURED", "Subscription renewal requires a configured payment provider.");
    throw new AppError(503, "PAYMENT_NOT_CONFIGURED", "Automatic renewal is not implemented in this release.");
  }

  reconciliation() { return new PaymentReconciliationService(this.db).report(); }
}
