import { fetchApi } from "@/lib/fetch-api";

import { useState, useEffect, useCallback } from "react";
import type { ApiAccountRow } from "@/lib/accounts-for-form";
import {
  transformAccountsForForm,
  type AccountForForm,
} from "@/lib/accounts-for-form";
import { toast } from "sonner";

export function useAccountsForForm(allowedPlatforms?: string[] | null) {
  const [accounts, setAccounts] = useState<AccountForForm[]>([]);
  const [loading, setLoading] = useState(true);
  const allowedKey = allowedPlatforms?.join(",") ?? "";

  const refetch = useCallback(async () => {
    setLoading(true);
    toast.dismiss();
    try {
      const res = await fetchApi("/api/accounts", { credentials: "include" });
      if (res.status === 401) {
        setAccounts([]);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load accounts");
      }
      const data = (await res.json()) as ApiAccountRow[];
      const allowedSet =
        allowedKey.length > 0 ? new Set(allowedKey.split(",")) : null;
      setAccounts(transformAccountsForForm(data, allowedSet));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load accounts");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [allowedKey]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { accounts, loading, refetch };
}
