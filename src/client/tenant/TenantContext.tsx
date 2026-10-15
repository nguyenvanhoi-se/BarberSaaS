import axios from "axios";
import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentShop, type PublicShop } from "../api/public-api";

type TenantState = {
  shop: PublicShop | null;
  isLoading: boolean;
  isNotFound: boolean;
  error: Error | null;
  retry(): void;
};

const TenantContext = createContext<TenantState | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["tenant", window.location.hostname],
    queryFn: getCurrentShop,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const error = query.error instanceof Error ? query.error : null;
  const state: TenantState = {
    shop: query.data ?? null,
    isLoading: query.isPending,
    isNotFound: axios.isAxiosError(query.error) && query.error.response?.status === 404,
    error,
    retry: () => { void query.refetch(); },
  };
  return <TenantContext.Provider value={state}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  const value = useContext(TenantContext);
  if (!value) throw new Error("useTenant must be used within TenantProvider");
  return value;
}
