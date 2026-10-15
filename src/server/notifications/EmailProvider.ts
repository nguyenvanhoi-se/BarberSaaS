export type EmailContent = { subject: string; html: string; text: string };
export type EmailMessage = { to: string; from: string; replyTo?: string; content: EmailContent; tags?: Record<string, string> };
export type EmailSendResult = { providerMessageId: string };
export type EmailHealth = { configured: boolean; provider: string; status: "READY" | "NOT_CONFIGURED" };

/** Provider adapters live behind this interface; business events never call a vendor SDK. */
export interface EmailProvider {
  readonly name: string;
  checkConfiguration(): EmailHealth;
  healthCheck(): Promise<EmailHealth>;
  sendEmail(message: EmailMessage): Promise<EmailSendResult>;
  sendTemplate(message: EmailMessage): Promise<EmailSendResult>;
}

export class NoopEmailProvider implements EmailProvider {
  readonly name = "none";
  checkConfiguration(): EmailHealth { return { configured: false, provider: this.name, status: "NOT_CONFIGURED" }; }
  async healthCheck() { return this.checkConfiguration(); }
  async sendEmail(): Promise<EmailSendResult> { throw new Error("EMAIL_NOT_CONFIGURED"); }
  async sendTemplate(): Promise<EmailSendResult> { throw new Error("EMAIL_NOT_CONFIGURED"); }
}
