import { AppError } from "../utils/app-error";

export const RESERVED_SUBDOMAINS = new Set([
  "www","api","admin","super-admin","app","dashboard","mail","support","status","cdn",
  "assets","static","help","docs","billing","auth","ftp","smtp","imap","pop","ns1","ns2",
]);

const LABEL=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const IPV4=/^(?:\d{1,3}\.){3}\d{1,3}$/u;

export function normalizeHostname(input:string):string {
  const value=input.trim().toLowerCase().replace(/\.$/u,"");
  if(!value||value.length>253||/[\s/:?#@*]/u.test(value)||value.includes(".."))throw new AppError(422,"INVALID_HOSTNAME","Enter a hostname only, without a protocol or path.");
  if(IPV4.test(value)||value.startsWith("[")||value.endsWith("]"))throw new AppError(422,"INVALID_HOSTNAME","IP addresses are not supported.");
  const labels=value.split(".");
  if(labels.some((label)=>label.length>63||!LABEL.test(label)))throw new AppError(422,"INVALID_HOSTNAME","Hostname format is invalid.");
  if(labels.length<2&&value!=="localhost")throw new AppError(422,"INVALID_HOSTNAME","Enter a fully qualified domain name.");
  return value;
}

export function normalizeRequestHostname(hostHeader:string|null,requestUrl:string,allowLocalhost:boolean):string {
  let hostname:string;
  try { hostname=hostHeader?new URL(`http://${hostHeader}`).hostname:new URL(requestUrl).hostname; }
  catch { return ""; }
  const normalized=hostname.toLowerCase().replace(/\.$/u,"");
  if(allowLocalhost&&(/^[a-z0-9-]+\.localhost$/u.test(normalized)||normalized==="localhost"))return normalized;
  try { return normalizeHostname(normalized); } catch { return ""; }
}

export function validateCustomHostname(input:string,platformDomain:string|null,appEnv:string|undefined):string {
  const hostname=normalizeHostname(input);
  if(hostname==="localhost"||hostname.endsWith(".localhost"))throw new AppError(422,"INVALID_HOSTNAME","Local hostnames cannot be connected as custom domains.");
  if(IPV4.test(hostname))throw new AppError(422,"INVALID_HOSTNAME","A public domain name is required.");
  if(appEnv==="production"&&hostname.endsWith(".test"))throw new AppError(422,"INVALID_HOSTNAME","Test domains are not supported in production.");
  if(platformDomain&&(hostname===platformDomain||hostname.endsWith(`.${platformDomain}`)))throw new AppError(422,"PLATFORM_DOMAIN_RESERVED","Use the shop slug for a platform subdomain.");
  return hostname;
}

export function platformDomain(value:string|undefined):string|null {
  if(!value)return null;
  try{return normalizeHostname(value);}catch{return null;}
}
