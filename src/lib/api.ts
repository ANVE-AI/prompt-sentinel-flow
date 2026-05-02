import { useAuth } from "@clerk/clerk-react";
import { useCallback } from "react";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export function useDashboardApi() {
  const { getToken } = useAuth();

  const call = useCallback(
    async <T = any>(action: string, opts: { method?: string; body?: any; query?: Record<string, string> } = {}): Promise<T> => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const qs = new URLSearchParams({ action, ...(opts.query ?? {}) }).toString();
      const res = await fetch(`${FN_BASE}/dashboard?${qs}`, {
        method: opts.method ?? "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: opts.body ? JSON.stringify({ action, ...opts.body }) : JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      return data;
    },
    [getToken],
  );

  return { call };
}
