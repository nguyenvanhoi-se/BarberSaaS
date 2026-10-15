import type { D1Database } from "@cloudflare/workers-types";
import { BillingRepository } from "../repositories/billing.repository";

/** Read-only report. Reconciliation never repairs money or entitlements automatically. */
export class PaymentReconciliationService {
  private readonly repository: BillingRepository;
  constructor(db: D1Database) { this.repository = new BillingRepository(db); }
  report() { return this.repository.reconciliationReport(); }
}
