import type { Bindings } from "../types/bindings";
import { sha256Hex } from "../utils/crypto";
import { NotificationRepository } from "../repositories/notification.repository";
import { NoopEmailProvider, type EmailHealth, type EmailProvider } from "./EmailProvider";
import { renderEmail, type EmailTemplateName, type TemplateData } from "./email-templates";

export type EmailJob = { shopId: string | null; userId: string | null; recipient: string; notificationKey: string; data: TemplateData };
export type EmailSendOutcome = { status: "SENT" | "FAILED" | "DUPLICATE"; errorCode?: string };

/** Provider selection is deliberately fail-closed until a real Worker-compatible adapter is installed. */
export class EmailService {
  private readonly repository: NotificationRepository;
  private readonly provider: EmailProvider;
  constructor(private readonly env: Bindings, db: D1Database, provider?: EmailProvider) {
    this.repository = new NotificationRepository(db);
    this.provider = provider ?? new NoopEmailProvider();
  }

  healthCheck(): EmailHealth {
    const providerHealth=this.provider.checkConfiguration();
    const from=this.env.EMAIL_FROM?.trim()??"";
    const validFrom=/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(from);
    const enabled=this.env.EMAIL_ENABLED?.toLowerCase()==="true";
    const selected=(this.env.EMAIL_PROVIDER??"none").toLowerCase();
    // There are no vendor adapters in this phase. A vendor label/secret cannot make one configured.
    const configured=enabled&&selected===this.provider.name&&selected!=="none"&&providerHealth.configured&&validFrom;
    return { provider: selected, configured, status: configured?"READY":"NOT_CONFIGURED" };
  }

  async send(job: EmailJob, requestId="background"): Promise<EmailSendOutcome> {
    const template=job.data.template as EmailTemplateName;
    const recipient=job.recipient.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient))return {status:"FAILED",errorCode:"INVALID_RECIPIENT"};
    const selected=(this.env.EMAIL_PROVIDER??"none").toLowerCase();
    const recipientHash=await sha256Hex(recipient);
    const claimed=await this.repository.claim({id:crypto.randomUUID(),shopId:job.shopId,userId:job.userId,recipient,recipientHash,template,key:job.notificationKey,provider:selected});
    if(!claimed)return {status:"DUPLICATE"};
    const health=this.healthCheck();
    if(!health.configured){
      await this.repository.finish(job.notificationKey,{status:"FAILED",errorCode:"NOT_CONFIGURED",attempts:0});
      this.log(requestId,job,recipientHash,"FAILED","NOT_CONFIGURED",selected);
      return {status:"FAILED",errorCode:"NOT_CONFIGURED"};
    }
    const content=renderEmail(job.data);
    content.subject=content.subject.replace(/[\r\n]+/gu," ").slice(0,200);
    let attempt=0;
    while(attempt<3){
      attempt++;
      try{
        const message={to:recipient,from:this.env.EMAIL_FROM!.trim(),...(this.env.EMAIL_REPLY_TO?.trim()?{replyTo:this.env.EMAIL_REPLY_TO.trim()}:{}),content,tags:{template,shop_id:job.shopId??"platform"}};
        const result=await this.provider.sendTemplate(message);
        await this.repository.finish(job.notificationKey,{status:"SENT",messageId:result.providerMessageId,attempts:attempt,sentAt:new Date().toISOString()});
        this.log(requestId,job,recipientHash,"SENT",undefined,this.provider.name);
        return {status:"SENT"};
      }catch(error){
        const retryable=isTransient(error);
        if(retryable&&attempt<3)continue;
        const code=retryable?"PROVIDER_RETRY_EXHAUSTED":"PROVIDER_SEND_FAILED";
        await this.repository.finish(job.notificationKey,{status:"FAILED",errorCode:code,attempts:attempt});
        this.log(requestId,job,recipientHash,"FAILED",code,this.provider.name);
        return {status:"FAILED",errorCode:code};
      }
    }
    return {status:"FAILED",errorCode:"PROVIDER_RETRY_EXHAUSTED"};
  }

  private log(requestId:string,job:EmailJob,recipientHash:string,status:string,errorCode:string|undefined,provider:string){
    console.log(JSON.stringify({event:"notification.delivery",requestId,notificationType:job.data.template,shopId:job.shopId,recipientHash,status,provider,errorCode:errorCode??null}));
  }
}

function isTransient(error:unknown){
  if(error instanceof Error&&error.name==="AbortError")return true;
  if(error&&typeof error==="object"&&"status" in error){const status=Number((error as {status:unknown}).status);return status===429||status>=500;}
  return false;
}
