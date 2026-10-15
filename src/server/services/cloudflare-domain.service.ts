import type { Bindings } from "../types/bindings";
import { AppError } from "../utils/app-error";

export type CloudflareHostname={id:string;hostname:string;status:string;ssl:{status:string;method?:string;validation_records?:Array<Record<string,unknown>>};ownership_verification?:{name?:string;type?:string;value?:string};ownership_verification_http?:{http_url?:string;http_body?:string};validation_errors?:Array<{message?:string}>};
export type CloudflareConfig={enabled:boolean;configured:boolean;apiToken:string|null;zoneId:string|null;cnameTarget:string|null};
function config(bindings:Bindings):CloudflareConfig {
  const apiToken=bindings.CLOUDFLARE_API_TOKEN?.trim()||null,zoneId=bindings.CLOUDFLARE_ZONE_ID?.trim()||null,cnameTarget=bindings.CUSTOM_DOMAIN_CNAME_TARGET?.trim().toLowerCase()||null;
  const provider=bindings.CUSTOM_DOMAIN_PROVIDER?.trim().toLowerCase()||"cloudflare";
  return {enabled:bindings.CUSTOM_DOMAIN_ENABLED?.toLowerCase()==="true",configured:provider==="cloudflare"&&Boolean(apiToken&&zoneId&&cnameTarget),apiToken,zoneId,cnameTarget};
}
function providerError(status:number):AppError {
  if(status===404)return new AppError(404,"DOMAIN_PROVIDER_NOT_FOUND","Cloudflare could not find this custom hostname.");
  if(status===409)return new AppError(409,"DOMAIN_PROVIDER_CONFLICT","Cloudflare reports a conflicting custom hostname.");
  if(status===429)return new AppError(429,"DOMAIN_PROVIDER_RATE_LIMITED","Domain provider is temporarily rate limiting requests.");
  if(status===401||status===403)return new AppError(503,"DOMAIN_PROVIDER_CONFIGURATION_ERROR","Custom domain provider credentials or permissions are not configured correctly.");
  return new AppError(status>=500?502:400,"DOMAIN_PROVIDER_ERROR","Custom domain provider could not complete the request.");
}

export class CloudflareDomainService {
  readonly config:CloudflareConfig;
  constructor(bindings:Bindings){this.config=config(bindings);}
  get enabled(){return this.config.enabled;}
  get configured(){return this.config.configured;}
  getCustomHostnameStatus(id:string){return this.getCustomHostname(id);}
  async createCustomHostname(hostname:string,method:"http"|"txt"|"email"="txt"):Promise<CloudflareHostname>{
    return this.request("POST","",{hostname,ssl:{method,type:"dv"}});
  }
  async getCustomHostname(id:string):Promise<CloudflareHostname>{return this.request("GET",`/${encodeURIComponent(id)}`);}
  async updateCustomHostname(id:string,method:"http"|"txt"|"email"="txt"):Promise<CloudflareHostname>{return this.request("PATCH",`/${encodeURIComponent(id)}`,{ssl:{method,type:"dv"}});}
  async deleteCustomHostname(id:string):Promise<void>{await this.request("DELETE",`/${encodeURIComponent(id)}`);}
  private async request(method:string,path:string,body?:unknown):Promise<CloudflareHostname>{
    if(!this.enabled||!this.configured||!this.config.apiToken||!this.config.zoneId)throw new AppError(503,"DOMAIN_PROVISIONING_NOT_CONFIGURED","Custom domain provisioning is not configured.");
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(this.config.zoneId)}/custom_hostnames${path}`,{method,headers:{Authorization:`Bearer ${this.config.apiToken}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
      if(!response.ok)throw providerError(response.status);
      const payload=await response.json() as {success?:boolean;result?:CloudflareHostname};
      if(payload.success!==true||!payload.result)throw new AppError(502,"DOMAIN_PROVIDER_ERROR","Custom domain provider returned an invalid response.");
      return payload.result;
    }catch(error){
      if(error instanceof AppError)throw error;
      if(error instanceof DOMException&&error.name==="AbortError")throw new AppError(504,"DOMAIN_PROVIDER_TIMEOUT","Custom domain provider timed out. Try again.");
      throw new AppError(502,"DOMAIN_PROVIDER_ERROR","Custom domain provider is unavailable. Try again.");
    }finally{clearTimeout(timeout);}
  }
}

export function hostnameState(host:CloudflareHostname):{status:"ACTIVE"|"VERIFYING"|"DISABLED"|"FAILED";verification_status:string;ssl_status:string;verification_records:Array<{type:string|undefined;name:string|undefined;value:string|undefined;status:string|undefined}>;validation_errors:string[]}{
  const upstream=(host.status??"").toLowerCase(),ssl=(host.ssl?.status??"").toLowerCase();
  const status:"ACTIVE"|"VERIFYING"|"DISABLED"|"FAILED"=upstream==="active"?"ACTIVE":upstream.includes("pending")||upstream==="initializing"?"VERIFYING":upstream==="deleted"?"DISABLED":upstream==="failed"||upstream.includes("timed_out")?"FAILED":"VERIFYING";
  const sslStatus=ssl==="active"?"ACTIVE":ssl.includes("timed_out")||ssl==="expired"||ssl==="deleted"?"FAILED":"PENDING";
  const ownership=host.ownership_verification;
  const validation=(host.ssl?.validation_records??[]).map((record)=>({
    type:typeof record.txt_name==="string"?"TXT":typeof record.cname==="string"?"CNAME":undefined,
    name:typeof record.txt_name==="string"?record.txt_name:typeof record.cname==="string"?record.cname:undefined,
    value:typeof record.txt_value==="string"?record.txt_value:typeof record.cname_target==="string"?record.cname_target:undefined,
    status:typeof record.status==="string"?record.status:undefined,
  })).filter((record)=>record.name||record.value);
  if(ownership?.name&&ownership.value)validation.unshift({type:ownership.type?.toUpperCase()??"TXT",name:ownership.name,value:ownership.value,status:undefined});
  return {status,verification_status:status==="ACTIVE"?"ACTIVE":status==="FAILED"?"FAILED":"PENDING",ssl_status:sslStatus,verification_records:validation,validation_errors:(host.validation_errors??[]).map((error)=>error.message).filter((value):value is string=>typeof value==="string").slice(0,5)};
}
