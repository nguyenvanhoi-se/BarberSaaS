import type { D1Database } from "@cloudflare/workers-types";
import type { BillingInterval } from "../billing/PaymentProvider";
import type { PlanId } from "../services/plan-catalog";

export type BillingPageQuery = { page: number; limit: number; status?: string; search?: string; shop_id?: string };

export class BillingRepository {
  constructor(private readonly db: D1Database) {}

  private async paginate<T>(rowsSql: string, countSql: string, values: (string | number)[], query: BillingPageQuery) {
    const offset = (query.page - 1) * query.limit;
    const [rows, count] = await Promise.all([
      this.db.prepare(`${rowsSql} LIMIT ? OFFSET ?`).bind(...values, query.limit, offset).all<T>(),
      this.db.prepare(countSql).bind(...values).first<{ total: number }>(),
    ]);
    return { items: rows.results, page: query.page, limit: query.limit, total: count?.total ?? 0 };
  }

  paymentsForShop(shopId: string, query: BillingPageQuery) {
    const clauses = ["p.shop_id=?"];
    const values: (string | number)[] = [shopId];
    if (query.status) { clauses.push("p.status=?"); values.push(query.status); }
    if (query.search) { clauses.push("(p.id LIKE ? OR i.invoice_number LIKE ? OR p.provider LIKE ?)"); const search = `%${query.search}%`; values.push(search, search, search); }
    const where = `WHERE ${clauses.join(" AND ")}`;
    return this.paginate(`SELECT p.id,p.invoice_id,i.invoice_number,i.plan,i.billing_interval,p.provider,p.amount,p.currency,p.status,p.payment_method,p.created_at,p.paid_at
      FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.shop_id=p.shop_id ${where} ORDER BY p.created_at DESC,p.id DESC`,
      `SELECT COUNT(*) total FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.shop_id=p.shop_id ${where}`, values, query);
  }

  paymentForShop(shopId: string, paymentId: string) {
    return this.db.prepare(`SELECT p.id,p.invoice_id,i.invoice_number,i.plan,i.billing_interval,p.provider,p.amount,p.currency,p.status,p.payment_method,p.created_at,p.paid_at
      FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.shop_id=p.shop_id WHERE p.shop_id=? AND p.id=? LIMIT 1`).bind(shopId, paymentId).first<Record<string, unknown>>();
  }

  invoicesForShop(shopId: string, query: BillingPageQuery) {
    const clauses = ["i.shop_id=?"];
    const values: (string | number)[] = [shopId];
    if (query.status) { clauses.push("i.status=?"); values.push(query.status); }
    if (query.search) { clauses.push("(i.invoice_number LIKE ? OR i.plan LIKE ?)"); const search = `%${query.search}%`; values.push(search, search); }
    const where = `WHERE ${clauses.join(" AND ")}`;
    return this.paginate(`SELECT i.id,i.invoice_number,i.plan,i.billing_interval,i.amount,i.currency,i.status,i.issued_at,i.due_at,i.paid_at
      FROM invoices i ${where} ORDER BY i.issued_at DESC,i.id DESC`, `SELECT COUNT(*) total FROM invoices i ${where}`, values, query);
  }

  invoiceForShop(shopId: string, invoiceId: string) {
    return this.db.prepare(`SELECT i.id,i.shop_id,i.subscription_id,i.invoice_number,i.plan,i.billing_interval,i.subtotal,i.tax_amount,i.amount,i.currency,i.status,i.issued_at,i.due_at,i.paid_at,i.details_json
      FROM invoices i WHERE i.shop_id=? AND i.id=? LIMIT 1`).bind(shopId, invoiceId).first<Record<string, unknown>>();
  }

  globalPayments(query: BillingPageQuery) {
    const clauses: string[] = [];
    const values: (string | number)[] = [];
    if (query.status) { clauses.push("p.status=?"); values.push(query.status); }
    if (query.shop_id) { clauses.push("p.shop_id=?"); values.push(query.shop_id); }
    if (query.search) { clauses.push("(p.id LIKE ? OR i.invoice_number LIKE ? OR s.name LIKE ? OR p.provider LIKE ?)"); const search = `%${query.search}%`; values.push(search, search, search, search); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.paginate(`SELECT p.id,p.shop_id,s.name shop_name,p.invoice_id,i.invoice_number,i.plan,p.provider,p.amount,p.currency,p.status,p.payment_method,p.created_at,p.paid_at
      FROM payments p JOIN shops s ON s.id=p.shop_id JOIN invoices i ON i.id=p.invoice_id AND i.shop_id=p.shop_id ${where} ORDER BY p.created_at DESC,p.id DESC`,
      `SELECT COUNT(*) total FROM payments p JOIN shops s ON s.id=p.shop_id JOIN invoices i ON i.id=p.invoice_id AND i.shop_id=p.shop_id ${where}`, values, query);
  }

  globalPayment(paymentId: string) {
    return this.db.prepare(`SELECT p.id,p.shop_id,s.name shop_name,p.subscription_id,p.invoice_id,i.invoice_number,i.plan,i.billing_interval,p.provider,p.provider_payment_id,p.amount,p.currency,p.status,p.payment_method,p.created_at,p.paid_at
      FROM payments p JOIN shops s ON s.id=p.shop_id JOIN invoices i ON i.id=p.invoice_id AND i.shop_id=p.shop_id WHERE p.id=? LIMIT 1`).bind(paymentId).first<Record<string, unknown> & { id: string; shop_id: string; subscription_id: string; invoice_id: string; invoice_number:string; amount: number; currency: string; status: string; plan: PlanId; billing_interval: BillingInterval }>();
  }

  globalInvoices(query: BillingPageQuery) {
    const clauses: string[] = [];
    const values: (string | number)[] = [];
    if (query.status) { clauses.push("i.status=?"); values.push(query.status); }
    if (query.shop_id) { clauses.push("i.shop_id=?"); values.push(query.shop_id); }
    if (query.search) { clauses.push("(i.invoice_number LIKE ? OR s.name LIKE ? OR i.plan LIKE ?)"); const search = `%${query.search}%`; values.push(search, search, search); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.paginate(`SELECT i.id,i.shop_id,s.name shop_name,i.invoice_number,i.plan,i.billing_interval,i.amount,i.currency,i.status,i.issued_at,i.due_at,i.paid_at
      FROM invoices i JOIN shops s ON s.id=i.shop_id ${where} ORDER BY i.issued_at DESC,i.id DESC`,
      `SELECT COUNT(*) total FROM invoices i JOIN shops s ON s.id=i.shop_id ${where}`, values, query);
  }

  globalInvoice(invoiceId: string) {
    return this.db.prepare(`SELECT i.id,i.shop_id,s.name shop_name,i.subscription_id,i.invoice_number,i.plan,i.billing_interval,i.subtotal,i.tax_amount,i.amount,i.currency,i.status,i.issued_at,i.due_at,i.paid_at,i.details_json
      FROM invoices i JOIN shops s ON s.id=i.shop_id WHERE i.id=? LIMIT 1`).bind(invoiceId).first<Record<string, unknown>>();
  }

  async audit(shopId: string, userId: string, action: string, entity: string, entityId: string, metadata: Record<string, unknown>) {
    await this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), shopId, userId, action, entity, entityId, JSON.stringify(metadata)).run();
  }

  async cancelAtPeriodEnd(shopId: string, subscriptionId: string, userId: string) {
    await this.db.batch([
      this.db.prepare("UPDATE subscriptions SET cancel_at_period_end=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND shop_id=?").bind(subscriptionId, shopId),
      this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), shopId, userId, "SUBSCRIPTION_CANCELLED", "subscription", subscriptionId, JSON.stringify({ timing: "PERIOD_END" })),
    ]);
  }

  async schedulePlanChange(shopId: string, subscriptionId: string, plan: PlanId, interval: BillingInterval, userId: string, oldPlan: PlanId, oldInterval: BillingInterval) {
    await this.db.batch([
      this.db.prepare("UPDATE subscriptions SET scheduled_plan=?,scheduled_billing_interval=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND shop_id=?").bind(plan, interval, subscriptionId, shopId),
      this.db.prepare("INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), shopId, userId, "PLAN_DOWNGRADE_SCHEDULED", "subscription", subscriptionId, JSON.stringify({ old_plan: oldPlan, new_plan: plan, old_billing_interval: oldInterval, new_billing_interval: interval, effective_at: "PERIOD_END" })),
    ]);
  }

  async manualConfirm(payment: NonNullable<Awaited<ReturnType<BillingRepository["globalPayment"]>>>, userId: string, reason: string) {
    const now = new Date();
    const expiry = new Date(now);
    if (payment.billing_interval === "YEARLY") expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
    else expiry.setUTCMonth(expiry.getUTCMonth() + 1);
    const paidAt = now.toISOString();
    const expiresAt = expiry.toISOString();
    const actionId = crypto.randomUUID();
    const result = await this.db.batch([
      this.db.prepare(`UPDATE payments SET status='PAID',paid_at=?,updated_at=? WHERE id=? AND shop_id=? AND status='PENDING'
        AND EXISTS(SELECT 1 FROM invoices i WHERE i.id=payments.invoice_id AND i.shop_id=payments.shop_id AND i.subscription_id=payments.subscription_id AND i.status='OPEN' AND i.amount=payments.amount AND i.currency=payments.currency)
        AND EXISTS(SELECT 1 FROM subscriptions sub WHERE sub.id=payments.subscription_id AND sub.shop_id=payments.shop_id)`)
        .bind(paidAt, paidAt, payment.id, payment.shop_id),
      this.db.prepare(`UPDATE invoices SET status='PAID',paid_at=?,updated_at=? WHERE id=? AND shop_id=? AND status='OPEN'
        AND EXISTS(SELECT 1 FROM payments p WHERE p.invoice_id=invoices.id AND p.shop_id=invoices.shop_id AND p.status='PAID' AND p.paid_at=? AND p.amount=invoices.amount AND p.currency=invoices.currency)`)
        .bind(paidAt, paidAt, payment.invoice_id, payment.shop_id, paidAt),
      this.db.prepare(`UPDATE subscriptions SET plan=?,status='ACTIVE',started_at=?,expired_at=?,billing_interval=?,cancel_at_period_end=0,scheduled_plan=NULL,scheduled_billing_interval=NULL,updated_at=? WHERE id=? AND shop_id=?
        AND EXISTS(SELECT 1 FROM invoices i WHERE i.subscription_id=subscriptions.id AND i.shop_id=subscriptions.shop_id AND i.status='PAID' AND i.paid_at=?)`)
        .bind(payment.plan, paidAt, expiresAt, payment.billing_interval, paidAt, payment.subscription_id, payment.shop_id, paidAt),
      this.db.prepare("UPDATE shops SET plan=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM subscriptions sub WHERE sub.shop_id=shops.id AND sub.id=? AND sub.updated_at=?)")
        .bind(payment.plan, paidAt, payment.shop_id, payment.subscription_id, paidAt),
      this.db.prepare(`INSERT INTO audit_logs(id,shop_id,user_id,action,entity,entity_id,metadata)
        SELECT ?,?,?,?,'payment',?,? WHERE EXISTS(SELECT 1 FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.shop_id=p.shop_id JOIN subscriptions sub ON sub.id=p.subscription_id AND sub.shop_id=p.shop_id
          WHERE p.id=? AND p.shop_id=? AND p.status='PAID' AND p.paid_at=? AND i.status='PAID' AND i.paid_at=? AND sub.status='ACTIVE' AND sub.updated_at=?)`)
        .bind(actionId, payment.shop_id, userId, "MANUAL_PAYMENT_ADJUSTMENT", payment.id, JSON.stringify({ reason, amount: payment.amount, currency: payment.currency, invoice_id: payment.invoice_id, subscription_id: payment.subscription_id }), payment.id, payment.shop_id, paidAt, paidAt, paidAt),
    ]);
    if (result[0]?.meta.changes !== 1 || result[1]?.meta.changes !== 1 || result[2]?.meta.changes !== 1 || result[4]?.meta.changes !== 1) throw new Error("PAYMENT_STATE_CONFLICT");
    return this.globalPayment(payment.id);
  }

  async reconciliationReport() {
    const [openInvoicesWithPaidPayment, paidInvoicesWithoutPaidPayment, pendingWebhooks] = await Promise.all([
      this.db.prepare(`SELECT i.id,i.shop_id,i.invoice_number,i.amount,i.currency FROM invoices i WHERE i.status<>'PAID' AND EXISTS(SELECT 1 FROM payments p WHERE p.invoice_id=i.id AND p.shop_id=i.shop_id AND p.status='PAID') ORDER BY i.issued_at DESC LIMIT 100`).all(),
      this.db.prepare(`SELECT i.id,i.shop_id,i.invoice_number,i.amount,i.currency FROM invoices i WHERE i.status='PAID' AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.invoice_id=i.id AND p.shop_id=i.shop_id AND p.status='PAID') ORDER BY i.issued_at DESC LIMIT 100`).all(),
      this.db.prepare("SELECT id,provider,event_id,event_type,status,created_at FROM payment_webhooks WHERE status<>'PROCESSED' ORDER BY created_at LIMIT 100").all(),
    ]);
    return { status: openInvoicesWithPaidPayment.results.length || paidInvoicesWithoutPaidPayment.results.length || pendingWebhooks.results.length ? "MISMATCH" : "OK", open_invoices_with_paid_payment: openInvoicesWithPaidPayment.results, paid_invoices_without_paid_payment: paidInvoicesWithoutPaidPayment.results, unprocessed_webhooks: pendingWebhooks.results };
  }
}
