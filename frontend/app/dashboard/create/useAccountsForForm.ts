"use client";

import { useState, useEffect, useCallback } from "react";
import type { ApiAccountRow } from "@/lib/accounts-for-form";
import {
  transformAccountsForForm,
  type AccountForForm,
} from "@/lib/accounts-for-form";

export function useAccountsForForm(allowedPlatforms?: string[] | null) {
  const [accounts, setAccounts] = useState<AccountForForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load accounts");
      }
      const data = (await res.json()) as ApiAccountRow[];
      const allowedSet =
        allowedPlatforms && allowedPlatforms.length > 0
          ? new Set(allowedPlatforms)
          : null;
      setAccounts(transformAccountsForForm(data, allowedSet));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [allowedPlatforms?.join(",")]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { accounts, loading, error, refetch };
}
