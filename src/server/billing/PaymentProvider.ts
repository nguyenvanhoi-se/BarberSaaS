import type { PlanId } from "../services/plan-catalog";

export type BillingInterval = "MONTHLY" | "YEARLY";
export type PaymentStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";

export type CheckoutInput = {
  shopId: string;
  subscriptionId: string;
  invoiceId: string;
  invoiceNumber: string;
  plan: PlanId;
  billingInterval: BillingInterval;
  amount: number;
  currency: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
};

export type VerifiedPaymentEvent = {
  eventId: string;
  eventType: string;
  providerPaymentId: string;
  providerReference: string | null;
  status: "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  amount: number;
  currency: string;
  paymentMethod: string | null;
};

/** Provider adapters must verify signatures before returning a normalized event. */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string; providerPaymentId: string; providerReference: string | null }>;
  verifyPayment(providerPaymentId: string): Promise<VerifiedPaymentEvent>;
  handleWebhook(request: Request): Promise<VerifiedPaymentEvent>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>;
  refundPayment(providerPaymentId: string, amount?: number): Promise<{ providerRefundId: string }>;
}
