export type InvoiceDocumentInput = {
  invoiceNumber: string;
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  issuedAt: string;
  dueAt: string;
  plan: string;
  interval: string;
  amount: number;
  currency: string;
};

/** PDF/HTML implementations can be added later without coupling invoice accounting to a renderer. */
export interface InvoiceDocumentGenerator {
  generateInvoiceDocument(invoice: InvoiceDocumentInput): Promise<Uint8Array>;
}
