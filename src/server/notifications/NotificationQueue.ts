import type { EmailJob, EmailSendOutcome, EmailService } from "./EmailService";

export interface NotificationQueue {
  enqueue(job: EmailJob, requestId?: string): Promise<void>;
  consume(job: EmailJob, requestId?: string): Promise<EmailSendOutcome>;
}

/** Direct execution is used until a Cloudflare Queue binding is provisioned. Callers run enqueue in waitUntil. */
export class DirectNotificationQueue implements NotificationQueue {
  constructor(private readonly email: EmailService) {}
  async enqueue(job:EmailJob,requestId?:string){await this.consume(job,requestId);}
  consume(job:EmailJob,requestId?:string){return this.email.send(job,requestId);}
}
