import { createContext,useContext,useState,type ReactNode } from "react";
import { NavLink,Outlet,useLocation } from "react-router-dom";
import { LayoutDashboard,CalendarDays,Scissors,Users,Star,Images,Settings,UserRound,Menu,X,LogOut,Store,CreditCard,Mail } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useTenant } from "../tenant/TenantContext";

type Toast={message:string;kind:"success"|"error"};
const ToastContext=createContext<(message:string,kind?:Toast["kind"])=>void>(()=>undefined);
export const useAdminToast=()=>useContext(ToastContext);
const navigation=[
  ["Dashboard","/admin",LayoutDashboard], ["Bookings","/admin/bookings",CalendarDays], ["Services","/admin/services",Scissors],
  ["Barbers","/admin/barbers",Users], ["Customers","/admin/customers",Users], ["Reviews","/admin/reviews",Star],
  ["Gallery","/admin/gallery",Images], ["Billing","/admin/billing",CreditCard], ["Settings","/admin/settings",Settings], ["Notifications","/admin/settings/notifications",Mail], ["Profile","/admin/profile",UserRound],
] as const;
function Sidebar({close}:{close?:()=>void}) {
  const {currentUser,logout}=useAuth();const {shop}=useTenant();const name=shop?.name??"Your shop";
  return <div className="admin-sidebar-inner">
    <div className="admin-brand"><div className="admin-logo">{shop?.logo_url?<img src={shop.logo_url} alt=""/>:<Store size={19}/>}</div><div><b>{name}</b><small>BARBERSAAS · ADMIN</small></div></div>
    <nav aria-label="Shop administration" className="admin-nav">{navigation.map(([label,to,Icon])=><NavLink key={to} end={to==="/admin"} to={to} onClick={close} className={({isActive})=>`admin-nav-link${isActive?" active":""}`}><Icon size={18}/><span>{label}</span></NavLink>)}</nav>
    <div className="admin-user"><div className="admin-avatar">{currentUser?.name?.slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><b>{currentUser?.name}</b><small>{currentUser?.role?.replace("_"," ")}</small></div><button className="icon-button" onClick={()=>void logout()} aria-label="Log out" title="Log out"><LogOut size={17}/></button></div>
  </div>;
}
export function AdminLayout({children}:{children?:ReactNode}) {
  const [open,setOpen]=useState(false);const [toast,setToast]=useState<Toast|null>(null);const location=useLocation();
  const showToast=(message:string,kind:Toast["kind"]="success")=>{setToast({message,kind});window.setTimeout(()=>setToast(null),3200);};
  const title=navigation.find(([,to])=>to!=="/admin"&&location.pathname.startsWith(to))?.[0]??(location.pathname==="/admin"?"Dashboard":"Administration");
  return <ToastContext.Provider value={showToast}><div className="admin-shell">
    <aside className="admin-sidebar"><Sidebar/></aside>
    {open&&<div className="admin-mobile-backdrop" onClick={()=>setOpen(false)}><aside className="admin-sidebar mobile" onClick={(event)=>event.stopPropagation()}><button aria-label="Close navigation" className="admin-close" onClick={()=>setOpen(false)}><X/></button><Sidebar close={()=>setOpen(false)}/></aside></div>}
    <div className="admin-main"><header className="admin-topbar"><button className="admin-menu-button" onClick={()=>setOpen(true)} aria-label="Open navigation"><Menu/></button><div><p>Shop administration</p><h1>{title}</h1></div><div className="admin-top-user"><span>{useAuth().currentUser?.name}</span><span className="admin-avatar small">{useAuth().currentUser?.name?.slice(0,1).toUpperCase()}</span></div></header>
      <main className="admin-content">{children??<Outlet/>}</main>
    </div>
    {toast&&<div className={`admin-toast ${toast.kind}`} role="status">{toast.message}</div>}
  </div></ToastContext.Provider>;
}
