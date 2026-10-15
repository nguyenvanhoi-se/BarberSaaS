import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { UserRole } from "../../shared/auth";
import { useAuth } from "./AuthContext";

export function RequireAuth({ loginPath = "/login" }: { loginPath?: string } = {}) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <p role="status">Loading…</p>;
  if (!isAuthenticated) return <Navigate to={loginPath} replace state={{ from: location }} />;
  return <Outlet />;
}

export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { currentUser } = useAuth();
  if (!currentUser || !roles.includes(currentUser.role)) return <Navigate to="/403" replace />;
  return <Outlet />;
}
