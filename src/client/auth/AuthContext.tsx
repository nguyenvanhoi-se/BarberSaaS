import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser, LoginInput, RegisterInput } from "../../shared/auth";
import { apiClient } from "../lib/api-client";

type Envelope<T> = { success: true; data: T };
type AuthContextValue = {
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await apiClient.get<Envelope<{ user: AuthUser }>>("/auth/me");
      setCurrentUser(response.data.data.user);
    } catch {
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const response = await apiClient.post<Envelope<{ user: AuthUser }>>("/auth/login", input);
    setCurrentUser(response.data.data.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const response = await apiClient.post<Envelope<{ user: AuthUser }>>("/auth/register", input);
    setCurrentUser(response.data.data.user);
  }, []);

  const logout = useCallback(async () => {
    try { await apiClient.post("/auth/logout"); }
    finally { setCurrentUser(null); }
  }, []);

  const value = useMemo(() => ({ currentUser, isAuthenticated: currentUser !== null, isLoading, login, register, logout, refresh }),
    [currentUser, isLoading, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
