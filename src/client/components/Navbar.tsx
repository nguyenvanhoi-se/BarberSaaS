import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useTenant } from "../tenant/TenantContext";
import { Image } from "./Image";

const links = [["Home", "/"], ["Services", "/services"], ["Barbers", "/barbers"], ["Gallery", "/gallery"], ["About", "/about"], ["Contact", "/contact"]] as const;

export function Navbar() {
  const { shop } = useTenant();
  const { currentUser, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <div className="site-container flex h-[76px] items-center justify-between gap-5">
      <Link to="/" className="flex min-w-0 items-center gap-3" aria-label={`${shop?.name ?? "Barbershop"} home`} onClick={() => setOpen(false)}>
        {shop?.logo_url ? <Image src={shop.logo_url} alt={`${shop.name} logo`} className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--accent-color)] font-display text-lg text-[var(--accent-color)]">{shop?.name.slice(0, 1) ?? "B"}</span>}
        <span className="truncate font-display text-lg font-semibold tracking-wide text-white">{shop?.name}</span>
      </Link>
      <nav aria-label="Main navigation" className="hidden items-center gap-6 lg:flex">{links.map(([label, href]) => <NavLink key={href} to={href} end={href === "/"} className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}>{label}</NavLink>)}</nav>
      <div className="hidden items-center gap-4 lg:flex">
        <Link to="/book" className="button button-primary">Book Now</Link>
        {currentUser ? <div className="flex items-center gap-3 text-sm">
          {currentUser.role === "CUSTOMER" && <Link className="nav-link" to="/my-bookings">My Bookings</Link>}
          <Link className="nav-link" to="/profile">Profile</Link>
          {currentUser.role === "SHOP_OWNER" && <Link className="nav-link" to="/admin">Admin</Link>}
          {currentUser.role === "SUPER_ADMIN" && <Link className="nav-link" to="/super-admin">Super Admin</Link>}
          <button className="nav-link" onClick={() => void logout()}>Logout</button>
        </div> : <div className="flex items-center gap-3"><Link className="nav-link" to="/login">Login</Link><Link className="nav-link" to="/register">Register</Link></div>}
      </div>
      <button className="icon-button lg:hidden" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen((value) => !value)}>{open ? <X size={22}/> : <Menu size={22}/>}</button>
    </div>
    {open && <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-white/10 bg-[var(--primary-color)] px-5 pb-6 pt-3 lg:hidden">
      {links.map(([label, href]) => <NavLink key={href} to={href} end={href === "/"} onClick={() => setOpen(false)} className={({ isActive }) => `mobile-nav-link ${isActive ? "text-[var(--accent-color)]" : ""}`}>{label}</NavLink>)}
      <Link to="/book" onClick={() => setOpen(false)} className="button button-primary mt-4 w-full">Book Now</Link>
      {currentUser ? <div className="mt-4 grid gap-3">
        <Link onClick={() => setOpen(false)} className="mobile-nav-link" to="/profile">Profile</Link>
        {currentUser.role === "CUSTOMER" && <Link onClick={() => setOpen(false)} className="mobile-nav-link" to="/my-bookings">My Bookings</Link>}
        {currentUser.role === "SHOP_OWNER" && <Link onClick={() => setOpen(false)} className="mobile-nav-link" to="/admin">Admin</Link>}
        {currentUser.role === "SUPER_ADMIN" && <Link onClick={() => setOpen(false)} className="mobile-nav-link" to="/super-admin">Super Admin</Link>}
        <button className="mobile-nav-link text-left" onClick={() => { setOpen(false); void logout(); }}>Logout</button>
      </div> : <div className="mt-4 flex gap-5"><Link onClick={() => setOpen(false)} className="mobile-nav-link" to="/login">Login</Link><Link onClick={() => setOpen(false)} className="mobile-nav-link" to="/register">Register</Link></div>}
    </nav>}
  </header>;
}
