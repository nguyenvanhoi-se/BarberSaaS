import type { PlanId } from "./plan-catalog";

export type CheckoutRequest={shopId:string;plan:PlanId;billingInterval:"MONTHLY"|"YEARLY";successUrl:string;cancelUrl:string};
export interface BillingProvider {
  createCheckoutSession(input:CheckoutRequest):Promise<{url:string;providerSessionId:string}>;
  handleWebhook(request:Request):Promise<void>;
  cancelSubscription(providerSubscriptionId:string):Promise<void>;
  changePlan(providerSubscriptionId:string,plan:PlanId,billingInterval:"MONTHLY"|"YEARLY"):Promise<void>;
}

// Payment remains intentionally disabled until a real provider and webhook verification are configured.
export class BillingNotConfiguredError extends Error { constructor(){super("Payment processing is not configured.");this.name="BillingNotConfiguredError";} }
