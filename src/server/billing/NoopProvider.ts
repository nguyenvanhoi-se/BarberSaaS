import type { CheckoutInput, PaymentProvider, PaymentStatus, VerifiedPaymentEvent } from "./PaymentProvider";

/** Explicitly unavailable adapter. It never creates or simulates a payment. */
export class NoopProvider implements PaymentProvider {
  readonly name = "none";
  private unavailable(): never { throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED"); }
  async createCheckout(_input: CheckoutInput): Promise<{ checkoutUrl: string; providerPaymentId: string; providerReference: string | null }> { return this.unavailable(); }
  async verifyPayment(_providerPaymentId: string): Promise<VerifiedPaymentEvent> { return this.unavailable(); }
  async handleWebhook(_request: Request): Promise<VerifiedPaymentEvent> { return this.unavailable(); }
  async getPaymentStatus(_providerPaymentId: string): Promise<PaymentStatus> { return this.unavailable(); }
  async refundPayment(_providerPaymentId: string, _amount?: number): Promise<{ providerRefundId: string }> { return this.unavailable(); }
}
