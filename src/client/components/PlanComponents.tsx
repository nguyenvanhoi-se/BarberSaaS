import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { FeatureName } from "../../server/services/plan-catalog";

export function FeatureGate({feature,enabled,children}:{feature:FeatureName;enabled:boolean;children:ReactNode}){
  if(enabled)return children;
  return <section className="plan-gate"><b>{feature.replaceAll("_"," ")} is not included in this plan</b><p>Keep your data and upgrade to enable this feature.</p><Link className="admin-button primary" to="/admin/billing">Upgrade plan</Link></section>;
}

export function UsageProgress({label,used,limit}:{label:string;used:number;limit:number|null}){
  const unlimited=limit===null;const percent=unlimited?0:Math.min(100,Math.round(used/Math.max(1,limit)*100));
  return <div className={`usage-progress${!unlimited&&percent>=85?" near-limit":""}`}><div><b>{label}</b><span>{used.toLocaleString()} / {unlimited?"Unlimited":limit?.toLocaleString()}</span></div>{!unlimited&&<div className="usage-track" role="progressbar" aria-label={`${label} usage`} aria-valuemin={0} aria-valuemax={limit??0} aria-valuenow={used}><i style={{width:`${percent}%`}}/></div>}{!unlimited&&percent>=85&&<small>You're nearing this plan limit.</small>}</div>;
}
