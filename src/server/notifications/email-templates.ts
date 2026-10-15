import type { EmailContent } from "./EmailProvider";

export type EmailTemplateName = "booking_created" | "booking_confirmed" | "booking_cancelled" | "booking_completed" | "booking_reminder" | "welcome" | "password_reset" | "payment_success" | "payment_failed" | "subscription_expiring" | "domain_verified" | "domain_failed";
export type BookingEmailData = {
  customerName: string; shopName: string; bookingCode: string; serviceName: string; barberName: string;
  bookingDate: string; startTime: string; endTime: string; totalPrice: number; currency: string;
  status: string; shopPhone?: string | null; shopEmail?: string | null; shopAddress?: string | null;
  logoUrl?: string | null; shopUrl: string; bookingUrl: string; reason?: string | null;
  customerPhone?: string | null; ownerName?: string; audience?: "customer" | "owner";
};
type WelcomeEmailData={customerName:string;shopName:string;shopUrl:string;logoUrl?:string|null};
type ResetEmailData={userName:string;resetUrl:string;expiresMinutes:number};
type PaymentEmailData={ownerName:string;shopName:string;plan:string;amount:number;currency:string;invoiceNumber:string;billingUrl:string;logoUrl?:string|null};
type SubscriptionEmailData={ownerName:string;shopName:string;plan:string;expiresAt:string;daysRemaining:number;billingUrl:string;logoUrl?:string|null};
type DomainEmailData={ownerName:string;shopName:string;hostname:string;domainsUrl:string;logoUrl?:string|null};
export type TemplateData =
  | { template: "booking_created" | "booking_confirmed" | "booking_cancelled" | "booking_completed" | "booking_reminder"; data: BookingEmailData }
  | { template: "welcome"; data: { customerName: string; shopName: string; shopUrl: string; logoUrl?: string | null } }
  | { template: "password_reset"; data: { userName: string; resetUrl: string; expiresMinutes: number } }
  | { template: "payment_success" | "payment_failed"; data: { ownerName: string; shopName: string; plan: string; amount: number; currency: string; invoiceNumber: string; billingUrl: string; logoUrl?: string | null } }
  | { template: "subscription_expiring"; data: { ownerName: string; shopName: string; plan: string; expiresAt: string; daysRemaining: number; billingUrl: string; logoUrl?: string | null } }
  | { template: "domain_verified" | "domain_failed"; data: { ownerName: string; shopName: string; hostname: string; domainsUrl: string; logoUrl?: string | null } };

const SUBJECTS: Record<EmailTemplateName, string> = {
  booking_created: "Booking Confirmation", booking_confirmed: "Your Booking Is Confirmed",
  booking_cancelled: "Booking Cancelled", booking_completed: "Thank You for Visiting",
  booking_reminder: "Appointment Reminder", welcome: "Welcome",
  password_reset: "Reset Your Password", payment_success: "Payment Receipt",
  payment_failed: "Payment Could Not Be Completed", subscription_expiring: "Subscription Expiration Reminder",
  domain_verified: "Your Domain Is Connected", domain_failed: "Domain Verification Needs Attention",
};
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const money = (amount: number, currency: string) => `${new Intl.NumberFormat("vi-VN").format(amount)} ${currency}`;
const layout = (shop: string, logo: string | null | undefined, title: string, lines: string[], cta?: { label: string; url: string }): string =>
  `<!doctype html><html><body style="margin:0;background:#f4f4f2;color:#171717;font-family:Arial,sans-serif"><main style="max-width:600px;margin:24px auto;background:#fff;padding:32px;border-radius:12px">${logo ? `<img src="${escape(logo)}" alt="${escape(shop)}" style="max-width:160px;max-height:70px">` : ""}<h1 style="font-size:24px">${escape(shop || "BarberSaaS")}</h1><h2>${escape(title)}</h2>${lines.map((line) => `<p>${escape(line)}</p>`).join("")}${cta ? `<p><a href="${escape(cta.url)}" style="display:inline-block;padding:12px 18px;background:#171717;color:#fff;text-decoration:none;border-radius:6px">${escape(cta.label)}</a></p>` : ""}<hr><small>${escape(shop || "BarberSaaS")} · This is a transactional email.</small></main></body></html>`;

export function renderEmail(input: TemplateData): EmailContent {
  const d = input.data;
  if (input.template.startsWith("booking_")) {
    const b = d as BookingEmailData;
    const owner = b.audience === "owner";
    const bookingTemplate=input.template as "booking_created"|"booking_confirmed"|"booking_cancelled"|"booking_completed"|"booking_reminder";
    const title = owner ? "New Booking Received" : SUBJECTS[bookingTemplate];
    const greeting = owner ? `Hello ${b.ownerName ?? "Shop Owner"}` : `Hi ${b.customerName}`;
    const lines = [greeting, ...(owner ? [`Customer: ${b.customerName}${b.customerPhone ? ` · ${b.customerPhone}` : ""}`] : []), `Booking code: ${b.bookingCode}`, `${b.serviceName} with ${b.barberName}`, `${b.bookingDate}, ${b.startTime}–${b.endTime}`, `${money(b.totalPrice, b.currency)} · ${b.status}`, ...(b.reason ? [`Reason: ${b.reason}`] : []), ...(b.shopPhone ? [`Contact: ${b.shopPhone}`] : []), ...(b.shopAddress ? [b.shopAddress] : [])];
    const text = `${title} - ${b.shopName}\n${lines.join("\n")}\n${owner ? "Open dashboard" : "View booking"}: ${b.bookingUrl}`;
    return { subject: `${title} - ${b.shopName}`, html: layout(b.shopName, b.logoUrl, title, lines, { label: owner ? "Open dashboard" : "View booking", url: b.bookingUrl }), text };
  }
  if (input.template === "welcome") {
    const welcome=d as WelcomeEmailData;
    const text = `Welcome to ${welcome.shopName}, ${welcome.customerName}!\nVisit ${welcome.shopUrl}`;
    return { subject: `${SUBJECTS.welcome} to ${welcome.shopName}`, html: layout(welcome.shopName, welcome.logoUrl, SUBJECTS.welcome, [`Hi ${welcome.customerName}`], { label: "Visit your barbershop", url: welcome.shopUrl }), text };
  }
  if (input.template === "password_reset") {
    const reset=d as ResetEmailData;
    const text = `Hi ${reset.userName}, reset your password within ${reset.expiresMinutes} minutes: ${reset.resetUrl}`;
    return { subject: SUBJECTS.password_reset, html: layout("BarberSaaS", null, SUBJECTS.password_reset, [`Hi ${reset.userName}`, `This link expires in ${reset.expiresMinutes} minutes.`], { label: "Reset password", url: reset.resetUrl }), text };
  }
  if (input.template === "payment_success" || input.template === "payment_failed") {
    const payment=d as PaymentEmailData;
    const paid = input.template === "payment_success";
    const title = SUBJECTS[input.template];
    const text = `${title} - ${payment.shopName}\n${payment.invoiceNumber}\n${payment.plan}: ${money(payment.amount, payment.currency)}\n${payment.billingUrl}`;
    return { subject: `${title} - ${payment.shopName}`, html: layout(payment.shopName, payment.logoUrl, title, [`Hi ${payment.ownerName}`, `Invoice: ${payment.invoiceNumber}`, `Plan: ${payment.plan}`, `Amount: ${money(payment.amount, payment.currency)}`], { label: paid ? "View receipt" : "Review billing", url: payment.billingUrl }), text };
  }
  if (input.template === "subscription_expiring") {
    const subscription=d as SubscriptionEmailData;
    const text = `${SUBJECTS.subscription_expiring} - ${subscription.shopName}\n${subscription.plan} expires ${subscription.expiresAt} (${subscription.daysRemaining} days).\n${subscription.billingUrl}`;
    return { subject: `${SUBJECTS.subscription_expiring} - ${subscription.shopName}`, html: layout(subscription.shopName, subscription.logoUrl, SUBJECTS.subscription_expiring, [`Hi ${subscription.ownerName}`, `${subscription.plan} expires ${subscription.expiresAt} (${subscription.daysRemaining} days).`], { label: "View billing", url: subscription.billingUrl }), text };
  }
  const domain=d as DomainEmailData;
  const verified = input.template === "domain_verified";
  const title = SUBJECTS[input.template];
  const text = `${title} - ${domain.shopName}\n${domain.hostname}\n${domain.domainsUrl}`;
  return { subject: `${title} - ${domain.shopName}`, html: layout(domain.shopName, domain.logoUrl, title, [`Hi ${domain.ownerName}`, domain.hostname], { label: verified ? "Manage domains" : "Review domain setup", url: domain.domainsUrl }), text };
}
