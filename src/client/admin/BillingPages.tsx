import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost, type Page } from "../api/admin-api";
import { useAdminToast } from "./AdminLayout";
import { UsageProgress } from "../components/PlanComponents";

type Row = Record<string, unknown>;
type Plan = { id: string; name: string; monthlyPrice: number | null; yearlyPrice: number | null; currency: string; limits: Record<string, number | null>; features: Record<string, boolean> };
type BillingData = { id: string; plan: string; status: string; started_at: string; expired_at: string | null; trial_expired_at: string | null; cancel_at_period_end?: boolean; scheduled_plan?: string | null; scheduled_billing_interval?: string | null; is_active: boolean; plan_details: { name: string; features: Record<string, boolean> } };
const labelDate = (value: unknown) => typeof value === "string" ? new Date(value).toLocaleDateString("vi-VN") : "—";
const money = (amount: unknown, currency: unknown) => `${Number(amount ?? 0).toLocaleString("vi-VN")} ${String(currency ?? "VND")}`;
const useBillingQuery = <T,>(key: string, path: string) => useQuery({ queryKey: ["admin-billing", key, path], queryFn: () => adminGet<T>(path) });
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="admin-panel"><div className="admin-panel-head"><h2>{title}</h2></div>{children}</section>; }
function State({ children }: { children: React.ReactNode }) { return <div className="admin-empty">{children}</div>; }
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

export function BillingPage() {
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [invoicePage, setInvoicePage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const subscription = useBillingQuery<BillingData>("subscription", "/shop/billing/subscription");
  const usage = useBillingQuery<{ usage: Record<string, { used: number; limit: number | null }> }>("usage", "/shop/billing/usage");
  const config = useBillingQuery<{ enabled: boolean; status: string; currency: string }>("config", "/shop/billing/config");
  const plans = useBillingQuery<Plan[]>("plans", "/plans");
  const invoices = useBillingQuery<Page<Row>>("invoices", `/shop/billing/invoices?page=${invoicePage}&limit=10`);
  const payments = useBillingQuery<Page<Row>>("payments", `/shop/billing/payments?page=${paymentPage}&limit=10`);
  const cancel = useMutation({ mutationFn: () => adminPost<BillingData>("/shop/billing/cancel", {}), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["admin-billing"] }); toast("Cancellation scheduled for period end"); }, onError: () => toast("Could not schedule cancellation", "error") });
  const downgrade = useMutation({ mutationFn: (plan: string) => adminPost("/shop/billing/plan-change", { plan, billing_interval: interval }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["admin-billing"] }); toast("Plan change scheduled for period end"); }, onError: () => toast("Could not schedule plan change", "error") });
  const loading = [subscription, usage, config, plans, invoices, payments].some((query) => query.isPending);
  if (loading) return <div className="admin-panel admin-loading" role="status">Loading billing information…</div>;
  if ([subscription, usage, config, plans, invoices, payments].some((query) => query.isError) || !subscription.data || !usage.data || !config.data || !plans.data || !invoices.data || !payments.data) {
    return <div className="admin-panel admin-error" role="alert">Could not load billing data. <button className="admin-button secondary" onClick={() => [subscription, usage, config, plans, invoices, payments].forEach((query) => void query.refetch())}>Try again</button></div>;
  }
  const sub = subscription.data;
  const planOrder: Record<string, number> = { BASIC: 0, PRO: 1, PREMIUM: 2 };
  const featureLabels: Record<string, string> = { booking: "Online booking", gallery: "Photo gallery", reviews: "Customer reviews", advanced_statistics: "Advanced statistics", custom_domain: "Custom domain", advanced_branding: "Advanced branding", export_reports: "Report exports" };
  const usageLabels: Record<string, string> = { barbers: "Barbers", services: "Services", gallery: "Gallery images", customers: "Customers", bookings_this_month: "Bookings this month" };
  return <>
    <div className="admin-page-head"><div><p className="admin-eyebrow">PLAN & BILLING</p><h2>Billing</h2><p>Subscription, usage, payment history and invoices for this shop.</p></div></div>
    <Panel title="Current subscription"><div className="billing-current"><div><small>Plan</small><h3>{sub.plan_details.name}</h3></div><span className={`admin-status ${sub.status.toLowerCase()}`}>{sub.status}</span><div><small>Started</small><b>{labelDate(sub.started_at)}</b></div><div><small>Period ends</small><b>{labelDate(sub.expired_at ?? sub.trial_expired_at)}</b></div></div>
      {sub.cancel_at_period_end && <p className="billing-warning">Cancellation is scheduled at the end of this billing period. Current access remains available until then.</p>}
      {sub.scheduled_plan && <p className="billing-notice">{sub.scheduled_plan} plan is scheduled for the next period.</p>}
      {sub.status === "TRIAL" && <p className="billing-notice">Trial subscription · {Math.max(0, Math.ceil((Date.parse(sub.trial_expired_at ?? sub.expired_at ?? "") - Date.now()) / 86_400_000))} days remaining.</p>}
      {!sub.is_active && <p className="billing-warning">Subscription is not active. Existing shop data is retained.</p>}
      {sub.is_active && !sub.cancel_at_period_end && <button className="admin-button secondary" disabled={cancel.isPending} onClick={() => { if (window.confirm("Schedule cancellation at the end of the current period?")) cancel.mutate(); }}>{cancel.isPending ? "Scheduling…" : "Cancel at period end"}</button>}
    </Panel>
    <Panel title="Usage"><div className="usage-grid">{Object.entries(usage.data.usage).map(([key, item]) => <UsageProgress key={key} label={usageLabels[key] ?? key} used={item.used} limit={item.limit}/>)}</div></Panel>
    <Panel title="Available plans"><label className="admin-field" style={{ maxWidth: 240 }}><span>Billing interval</span><select className="admin-select" value={interval} onChange={(event) => setInterval(event.target.value as "MONTHLY" | "YEARLY")}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label><div className="billing-plans">{plans.data.map((plan) => <article className={plan.id === sub.plan ? "current" : ""} key={plan.id}><small>{plan.id}{plan.id === sub.plan ? " · Current" : ""}</small><h3>{plan.name}</h3><b>{(interval === "MONTHLY" ? plan.monthlyPrice : plan.yearlyPrice) === null ? "Pricing not configured" : `${money(interval === "MONTHLY" ? plan.monthlyPrice : plan.yearlyPrice, plan.currency)} / ${interval.toLowerCase()}`}</b><ul><li>Barbers: {plan.limits.maxBarbers ?? "Unlimited"}</li><li>Services: {plan.limits.maxServices ?? "Unlimited"}</li><li>Gallery: {plan.limits.maxGalleryImages ?? "Unlimited"}</li></ul><p>{Object.entries(plan.features).filter(([, enabled]) => enabled).map(([key]) => featureLabels[key] ?? key).join(" · ")}</p>{plan.id === sub.plan ? <span className="admin-status active">Current plan</span> : planOrder[plan.id] < planOrder[sub.plan] && sub.is_active ? <button className="admin-button secondary" disabled={downgrade.isPending} onClick={() => { if (window.confirm(`Schedule downgrade to ${plan.id} for period end?`)) downgrade.mutate(plan.id); }}>Schedule downgrade</button> : <button className="admin-button secondary" disabled title="Online payment is not configured">Payment unavailable</button>}</article>)}</div><p className="billing-notice">{config.data.status === "NOT_CONFIGURED" ? "Online payment is not configured. No checkout or payment is simulated." : "Online payment is available."}</p></Panel>
    <Panel title="Payment history">{payments.data.items.length ? <><Table headers={["Date", "Invoice", "Plan", "Amount", "Status", "Provider"]}>{payments.data.items.map((row) => <tr key={String(row.id)}><td>{labelDate(row.created_at)}</td><td>{String(row.invoice_number)}</td><td>{String(row.plan)}</td><td>{money(row.amount, row.currency)}</td><td>{String(row.status)}</td><td>{String(row.provider)}</td></tr>)}</Table><div className="admin-pagination"><span>{payments.data.total} payments · page {paymentPage}</span><div><button className="admin-button secondary" disabled={paymentPage <= 1} onClick={() => setPaymentPage(paymentPage - 1)}>Previous</button><button className="admin-button secondary" disabled={paymentPage * 10 >= payments.data.total} onClick={() => setPaymentPage(paymentPage + 1)}>Next</button></div></div></> : <State>No payments recorded.</State>}</Panel>
    <Panel title="Invoices">{invoices.data.items.length ? <><Table headers={["Invoice", "Issued", "Due", "Amount", "Status", ""]}>{invoices.data.items.map((row) => <tr key={String(row.id)}><td>{String(row.invoice_number)}</td><td>{labelDate(row.issued_at)}</td><td>{labelDate(row.due_at)}</td><td>{money(row.amount, row.currency)}</td><td>{String(row.status)}</td><td><Link className="admin-inline-link" to={`/admin/billing/invoices/${String(row.id)}`}>View</Link></td></tr>)}</Table><div className="admin-pagination"><span>{invoices.data.total} invoices · page {invoicePage}</span><div><button className="admin-button secondary" disabled={invoicePage <= 1} onClick={() => setInvoicePage(invoicePage - 1)}>Previous</button><button className="admin-button secondary" disabled={invoicePage * 10 >= invoices.data.total} onClick={() => setInvoicePage(invoicePage + 1)}>Next</button></div></div></> : <State>No invoices issued.</State>}</Panel>
  </>;
}

export function BillingInvoicePage() {
  const { id = "" } = useParams();
  const query = useBillingQuery<Row>("invoice-detail", `/shop/billing/invoices/${encodeURIComponent(id)}`);
  if (query.isPending) return <div className="admin-panel admin-loading" role="status">Loading invoice…</div>;
  if (query.isError || !query.data) return <div className="admin-panel admin-error" role="alert">Invoice not found or unavailable.</div>;
  const invoice = query.data;
  let details: Row = {};
  try { details = JSON.parse(String(invoice.details_json ?? "{}")) as Row; } catch { /* display only safe column values */ }
  return <><div className="admin-page-head"><div><p className="admin-eyebrow">BILLING DOCUMENT</p><h2>Invoice {String(invoice.invoice_number)}</h2><p>Shop billing record · {String(invoice.status)}</p></div><button className="admin-button secondary" onClick={() => window.print()}>Print invoice</button></div><section className="admin-panel billing-invoice"><h1>{String(details.business_name ?? "BarberSaaS shop")}</h1><p>{String(details.address ?? "")}</p><p>{String(details.email ?? "")} · {String(details.phone ?? "")}</p><hr/><p>Invoice number: <b>{String(invoice.invoice_number)}</b></p><p>Issued: {labelDate(invoice.issued_at)} · Due: {labelDate(invoice.due_at)}</p><p>Plan: {String(invoice.plan)} · {String(invoice.billing_interval)}</p><h2>Total: {money(invoice.amount, invoice.currency)}</h2><p>Status: {String(invoice.status)}{invoice.paid_at ? ` · Paid ${labelDate(invoice.paid_at)}` : ""}</p><Link className="admin-inline-link" to="/admin/billing">Back to billing</Link></section></>;
}

export function BillingPaymentResultPage() {
  const params = new URLSearchParams(window.location.search);
  const paymentId = params.get("payment_id");
  const query = useBillingQuery<Row>("payment-result", `/shop/billing/payments/${encodeURIComponent(paymentId ?? "missing")}`);
  if (!paymentId) return <section className="admin-panel"><h2>Payment status unavailable</h2><p>Online payment is not configured. No payment has been recorded.</p><Link to="/admin/billing">Return to billing</Link></section>;
  if (query.isPending) return <div className="admin-panel admin-loading" role="status">Verifying payment with the server…</div>;
  if (query.isError || !query.data) return <section className="admin-panel admin-error"><h2>Payment status unavailable</h2><p>We could not verify this payment. Check billing history or contact support.</p><Link to="/admin/billing">Return to billing</Link></section>;
  const status = String(query.data.status);
  return <section className="admin-panel"><h2>{status === "PAID" ? "Payment successful" : status === "FAILED" ? "Payment failed" : status === "CANCELLED" ? "Payment cancelled" : "Processing payment"}</h2><p>Verified status: {status}</p><Link to="/admin/billing">Return to billing</Link></section>;
}
