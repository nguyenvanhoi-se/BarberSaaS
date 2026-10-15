import { Outlet } from "react-router-dom";
import type { PublicShop } from "../api/public-api";
import { Footer } from "../components/Footer";
import { Navbar } from "../components/Navbar";
import { ErrorState, ShopNotFound, ShopStatusPage, TenantSkeleton } from "../components/States";
import { useTenant } from "./TenantContext";
import { useTenantSeo } from "./useTenantSeo";
import { useTenantTheme } from "./useTenantTheme";

export function ShopSite() {
  const tenant = useTenant();
  const shop = tenant.shop;
  useTenantTheme(shop);
  useTenantSeo(shop);
  if (tenant.isLoading) return <TenantSkeleton/>;
  if (tenant.isNotFound) return <ShopNotFound/>;
  if (tenant.error || !shop) return <main className="site-container py-24"><ErrorState onRetry={tenant.retry} title="We couldn't load this shop"/></main>;
  if (shop.status !== "ACTIVE") return <ShopStatusPage status={shop.status}/>;
  return <div className="min-h-screen bg-[var(--primary-color)] font-[var(--shop-font)] text-white"><Navbar/><main><Outlet/></main><Footer shop={shop}/></div>;
}

export function useCurrentShop(): PublicShop {
  const { shop } = useTenant();
  if (!shop) throw new Error("Shop page rendered without a resolved tenant");
  return shop;
}
