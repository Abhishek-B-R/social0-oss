"use client";

import { useState, useCallback } from "react";

const STORAGE_PREFIX = "remembered-accounts-";

export type RememberedAccountsData = {
  remember: boolean;
  accountIds: string[];
};

function readStored(key: string): RememberedAccountsData {
  if (typeof window === "undefined")
    return { remember: false, accountIds: [] };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return { remember: false, accountIds: [] };
    const data = JSON.parse(raw) as unknown;
    if (
      data &&
      typeof data === "object" &&
      "remember" in data &&
      typeof (data as RememberedAccountsData).remember === "boolean" &&
      "accountIds" in data &&
      Array.isArray((data as RememberedAccountsData).accountIds)
    ) {
      return {
        remember: (data as RememberedAccountsData).remember,
        accountIds: (data as RememberedAccountsData).accountIds.filter(
          (id): id is string => typeof id === "string"
        ),
      };
    }
  } catch (_) {}
  return { remember: false, accountIds: [] };
}

function writeStored(key: string, data: RememberedAccountsData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch (_) {}
}

/**
 * Hook to persist "Remember account selection" per form (post form, bulk image, bulk video).
 * Returns stored state and helpers to update it. Parent should:
 * - Initialize selectedIds from getInitialSelectedIds(validAccountIds) when appropriate.
 * - Call persistSelection(selectedIds) when remember is true and selection changes.
 */
export function useRememberedAccounts(key: string) {
  const [stored, setStored] = useState<RememberedAccountsData>(() =>
    readStored(key)
  );

  const setRemember = useCallback(
    (remember: boolean) => {
      setStored((prev) => {
        const next = { ...prev, remember };
        writeStored(key, next);
        return next;
      });
    },
    [key]
  );

  const persistSelection = useCallback(
    (ids: Set<string>) => {
      const accountIds = Array.from(ids);
      setStored((prev) => {
        const next = { ...prev, accountIds };
        writeStored(key, next);
        return next;
      });
    },
    [key]
  );

  /** Returns the set of account IDs that were stored when remember was true (for initializing selection). */
  const getInitialSelectedIds = useCallback(
    (validAccountIds: Set<string>): Set<string> => {
      if (!stored.remember || stored.accountIds.length === 0) return new Set();
      return new Set(
        stored.accountIds.filter((id) => validAccountIds.has(id))
      );
    },
    [stored.remember, stored.accountIds]
  );

  return {
    remember: stored.remember,
    setRemember,
    persistSelection,
    getInitialSelectedIds,
    rememberedAccountIds: stored.accountIds,
  };
}
