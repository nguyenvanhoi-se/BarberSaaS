import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { UserRole } from "../shared/auth";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequireRole } from "./auth/ProtectedRoutes";
import { AuthForm } from "./pages/AuthPages";
import { AccountPage, ForbiddenPage } from "./pages/AccountPages";
import { HomePage } from "./pages/HomePage";
import { MyBookingDetailPage, MyBookingsPage } from "./pages/MyBookingsPage";
import { ShopSite } from "./tenant/ShopSite";
import { TenantProvider } from "./tenant/TenantContext";

const AboutPage = lazy(() => import("./pages/PublicPages").then((m) => ({ default: m.AboutPage })));
const BarberDetailPage = lazy(() => import("./pages/PublicPages").then((m) => ({ default: m.BarberDetailPage })));
const PublicBarbersPage = lazy(() => import("./pages/PublicPages").then((m) => ({ default: m.BarbersPage })));
const BookPage = lazy(() => import("./pages/PublicPages").then((m) => ({ default: m.BookPage })));
const ContactPage = lazy(() => import("./pages/PublicPages").then((m) => ({ default: m.ContactPage })));
const PublicGalleryPage = lazy(() => import("./pages/PublicPages").then((m) => ({ default: m.GalleryPage })));
const PublicNotFoundPage = lazy(() => import("./pages/PublicPages").then((m) => ({ default: m.PublicNotFoundPage })));
const ReviewsPageSection = lazy(() => import("./pages/PublicPages").then((m) => ({ default: m.ReviewsPageSection })));
const PublicServicesPage = lazy(() => import("./pages/PublicPages").then((m) => ({ default: m.ServicesPage })));
const AdminLayout = lazy(() => import("./admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const DomainsPage = lazy(() => import("./admin/DomainsPage").then((m) => ({ default: m.DomainsPage })));
const NotificationsSettingsPage = lazy(() => import("./admin/NotificationsSettingsPage").then((m) => ({ default: m.NotificationsSettingsPage })));
const BarbersPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.BarbersPage })));
const BookingDetailPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.BookingDetailPage })));
const BookingsPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.BookingsPage })));
const CustomerDetailPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.CustomerDetailPage })));
const CustomersPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.CustomersPage })));
const DashboardPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.DashboardPage })));
const GalleryPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.GalleryPage })));
const ProfilePage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.ProfilePage })));
const ReviewsPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.ReviewsPage })));
const ServicesPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.ServicesPage })));
const SettingsPage = lazy(() => import("./admin/AdminPages").then((m) => ({ default: m.SettingsPage })));
const BillingPage = lazy(() => import("./admin/BillingPages").then((m) => ({ default: m.BillingPage })));
const BillingInvoicePage = lazy(() => import("./admin/BillingPages").then((m) => ({ default: m.BillingInvoicePage })));
const BillingPaymentResultPage = lazy(() => import("./admin/BillingPages").then((m) => ({ default: m.BillingPaymentResultPage })));
const SuperAdminLayout = lazy(() => import("./super-admin/SuperAdminLayout").then((m) => ({ default: m.SuperAdminLayout })));
const AcceptOwnerInvitePage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.AcceptOwnerInvitePage })));
const AuditLogsPage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.AuditLogsPage })));
const SuperAdminProfilePage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.SuperAdminProfilePage })));
const ShopDetailPage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.ShopDetailPage })));
const ShopsPage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.ShopsPage })));
const SubscriptionsPage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.SubscriptionsPage })));
const SuperAdminPaymentsPage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.SuperAdminPaymentsPage })));
const SuperAdminInvoicesPage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.SuperAdminInvoicesPage })));
const SuperDashboardPage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.SuperDashboardPage })));
const UserDetailPage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.UserDetailPage })));
const UsersPage = lazy(() => import("./super-admin/SuperAdminPages").then((m) => ({ default: m.UsersPage })));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

function RoleRoute({ roles }: { roles: UserRole[] }) { return <RequireRole roles={roles}/>; }

function AppRoutes() {
  return <Routes>
    <Route path="/super-admin/login" element={<AuthForm mode="login" redirectTo="/super-admin"/>}/>
    <Route path="/accept-invite" element={<AcceptOwnerInvitePage/>}/>
    <Route element={<ShopSite/>}>
      <Route index element={<HomePage/>}/>
      <Route path="services" element={<PublicServicesPage/>}/>
      <Route path="barbers" element={<PublicBarbersPage/>}/>
      <Route path="barbers/:id" element={<BarberDetailPage/>}/>
      <Route path="gallery" element={<PublicGalleryPage/>}/>
      <Route path="about" element={<AboutPage/>}/>
      <Route path="contact" element={<ContactPage/>}/>
      <Route path="book" element={<BookPage/>}/>
      <Route path="reviews" element={<ReviewsPageSection/>}/>
      <Route path="login" element={<AuthForm mode="login"/>}/>
      <Route path="register" element={<AuthForm mode="register"/>}/>
      <Route path="404" element={<PublicNotFoundPage/>}/>
      <Route path="*" element={<PublicNotFoundPage/>}/>
    </Route>
    <Route path="/403" element={<ForbiddenPage/>}/>
    <Route element={<RequireAuth/>}>
      <Route path="/profile" element={<AccountPage title="Profile"/>}/>
      <Route element={<RoleRoute roles={["CUSTOMER"]}/> }><Route path="/my-bookings" element={<MyBookingsPage/>}/><Route path="/my-bookings/:id" element={<MyBookingDetailPage/>}/></Route>
      <Route element={<RoleRoute roles={["SHOP_OWNER"]}/> }><Route path="/admin" element={<AdminLayout/>}>
        <Route index element={<DashboardPage/>}/><Route path="bookings" element={<BookingsPage/>}/><Route path="bookings/:id" element={<BookingDetailPage/>}/>
        <Route path="services" element={<ServicesPage/>}/><Route path="barbers" element={<BarbersPage/>}/><Route path="customers" element={<CustomersPage/>}/><Route path="customers/:id" element={<CustomerDetailPage/>}/>
        <Route path="reviews" element={<ReviewsPage/>}/><Route path="gallery" element={<GalleryPage/>}/><Route path="billing" element={<BillingPage/>}/><Route path="billing/invoices/:id" element={<BillingInvoicePage/>}/><Route path="billing/payment-result" element={<BillingPaymentResultPage/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="settings/domains" element={<DomainsPage/>}/><Route path="settings/notifications" element={<NotificationsSettingsPage/>}/><Route path="profile" element={<ProfilePage/>}/>
      </Route></Route>
    </Route>
    <Route element={<RequireAuth loginPath="/super-admin/login"/>}>
      <Route element={<RoleRoute roles={["SUPER_ADMIN"]}/> }><Route path="/super-admin" element={<SuperAdminLayout/>}>
        <Route index element={<SuperDashboardPage/>}/><Route path="shops" element={<ShopsPage/>}/><Route path="shops/:id" element={<ShopDetailPage/>}/>
        <Route path="users" element={<UsersPage/>}/><Route path="users/:id" element={<UserDetailPage/>}/><Route path="subscriptions" element={<SubscriptionsPage/>}/><Route path="payments" element={<SuperAdminPaymentsPage/>}/><Route path="invoices" element={<SuperAdminInvoicesPage/>}/>
        <Route path="audit-logs" element={<AuditLogsPage/>}/><Route path="profile" element={<SuperAdminProfilePage/>}/>
      </Route></Route>
    </Route>
    <Route path="*" element={<Navigate to="/404" replace/>}/>
  </Routes>;
}

export function App() {
  return <QueryClientProvider client={queryClient}><AuthProvider><TenantProvider><Suspense fallback={<div className="min-h-screen grid place-items-center text-sm text-neutral-500" role="status">Loading…</div>}><AppRoutes/></Suspense></TenantProvider></AuthProvider></QueryClientProvider>;
}
