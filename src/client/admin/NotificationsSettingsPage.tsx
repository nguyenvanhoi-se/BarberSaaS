import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { Mail,RefreshCw,Send } from "lucide-react";
import { adminGet,adminPost,adminPut } from "../api/admin-api";
import { useAdminToast } from "./AdminLayout";

type NotificationConfig={status:"READY"|"NOT_CONFIGURED";provider:string;configured:boolean;settings:Record<string,string>};
const fields:[keyof NotificationConfig["settings"],string,string][]=[
  ["booking_email_enabled","Customer booking emails","Confirmation, cancellation and completion notices."],
  ["owner_notification_enabled","New booking alerts","Send a new booking notice to the shop owner account."],
  ["reminder_enabled","Appointment reminders","Scheduled reminder before an appointment."],
  ["payment_email_enabled","Billing emails","Verified payment and subscription expiry notices."],
];

export function NotificationsSettingsPage(){
  const query=useQuery({queryKey:["admin","notifications"],queryFn:()=>adminGet<NotificationConfig>("/shop/notifications/config")});
  const client=useQueryClient(),toast=useAdminToast();
  const save=useMutation({mutationFn:(settings:Record<string,boolean>)=>adminPut("/shop/notifications/settings",settings),onSuccess:()=>{void client.invalidateQueries({queryKey:["admin","notifications"]});toast("Notification settings saved");},onError:()=>toast("Notification settings could not be saved","error")});
  const test=useMutation({mutationFn:()=>adminPost("/shop/notifications/test-email",{}),onSuccess:()=>toast("Test email sent"),onError:()=>toast("Email service is not configured","error")});
  if(query.isPending)return <div className="admin-panel admin-loading" role="status">Loading notification settings…</div>;
  if(query.isError||!query.data)return <div className="admin-panel admin-error"><p>Could not load notification settings.</p><button className="admin-button secondary" onClick={()=>void query.refetch()}><RefreshCw size={15}/> Try again</button></div>;
  const config=query.data;
  return <><div className="admin-page-head"><div><p className="admin-eyebrow">SHOP CONFIGURATION</p><h2>Email notifications</h2><p>Choose which transactional email categories are enabled for this shop.</p></div></div>
    <section className="admin-panel"><div className="admin-panel-head"><h2><Mail size={18}/> Email provider</h2><span className={`admin-notice-status${config.configured?" ready":""}`}>{config.configured?"Configured":"Not configured"}</span></div>
      <p className="text-sm text-neutral-600">{config.configured?`Provider: ${config.provider}`:"Email service is not configured. Events are recorded but no email is sent."}</p>
      <p className="mt-2 text-xs text-neutral-500">Owner address is taken from the authenticated shop owner account. Provider credentials are server-side only.</p>
      <button className="admin-button secondary mt-4" disabled={!config.configured||test.isPending} onClick={()=>test.mutate()}><Send size={15}/>{test.isPending?"Sending…":"Send test email"}</button>
    </section>
    <section className="admin-panel"><div className="admin-panel-head"><h2>Notification preferences</h2><span className="text-xs text-neutral-500">Transactional messages only</span></div>
      <div className="divide-y">{fields.map(([key,title,description])=><label key={key} className="flex items-center justify-between gap-4 py-4"><span><b className="block text-sm">{title}</b><small className="text-neutral-500">{description}</small></span><input type="checkbox" checked={config.settings[key]!=="false"} disabled={save.isPending} onChange={(event)=>{const next=Object.fromEntries(fields.map(([field])=>[field,config.settings[field]!=="false"]));next[key]=event.target.checked;save.mutate(next);}} aria-label={title}/></label>)}</div>
    </section>
  </>;
}
