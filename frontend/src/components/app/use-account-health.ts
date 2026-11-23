import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadConnectionsPageData } from "@/api/dashboard-data";
import { useSession } from "@/lib/auth-client";
import { reconnectUrl } from "@/lib/account-reconnect";
import { NEVER_EXPIRES_PLATFORMS } from "@/lib/platforms";

export type ConnectedAccount = Extract<
  Awaited<ReturnType<typeof loadConnectionsPageData>>,
  { ok: true }
>["data"]["accounts"][number];

export type AccountHealth = "healthy" | "expired" | "inactive";

export type AccountWithHealth = ConnectedAccount & {
  health: AccountHealth;
  /** "@handle" or display name, for UI copy. */
  handle: string;
  /** OAuth re-auth URL (full page navigation). */
  reconnectHref: string;
};

/** Shared React Query key; anything under ["connections"] is invalidated on workspace switch. */
export const CONNECTED_ACCOUNTS_QUERY_KEY = ["connections", "page-data"] as const;
/** Lives under ["connections"] so connection changes and workspace switches refetch it. */
export const SIDEBAR_ACCOUNTS_QUERY_KEY = ["connections", "sidebar-accounts"] as const;

function handleFor(a: ConnectedAccount): string {
  const name = a.platformUsername?.trim();
  if (!name) return a.platformDisplayName?.trim() || "account";
  if (a.platform === "tiktok" && /\s/.test(name)) return name;
  return `@${name}`;
}

function healthFor(a: ConnectedAccount): AccountHealth {
  if (a.isActive === false) return "inactive";
  if (a.tokenStatus === "expired" && !NEVER_EXPIRES_PLATFORMS.has(a.platform)) {
    return "expired";
  }
  return "healthy";
}

/**
 * Connected accounts in the active workspace with a health flag, plus the
 * plan's account limit. Used by the sidebar Accounts section, the reconnect
 * banner and the plan meter.
 */
export function useAccountHealth(options?: {
  enabled?: boolean;
  /** Run the live token refresh/verify first (Accounts page only; slow). */
  fullCheck?: boolean;
}) {
  const full = options?.fullCheck ?? false;
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({
    // Separate key from the Accounts page: this read skips the slow live
    // token check, and must not stand in for the Accounts page's full data.
    queryKey: full ? CONNECTED_ACCOUNTS_QUERY_KEY : SIDEBAR_ACCOUNTS_QUERY_KEY,
    queryFn: () =>
      full ? loadConnectionsPageData() : loadConnectionsPageData({ skipHealthCheck: true }),
    enabled: !!session && (options?.enabled ?? true),
    staleTime: 60_000,
    // The full check takes seconds per account. Show the sidebar's quick list
    // meanwhile, so the Accounts page isn't a skeleton for 20s.
    placeholderData: full
      ? () =>
          queryClient.getQueryData<Awaited<ReturnType<typeof loadConnectionsPageData>>>(
            SIDEBAR_ACCOUNTS_QUERY_KEY,
          )
      : undefined,
  });

  const result = query.data && query.data.ok ? query.data.data : null;

  const accounts = useMemo<AccountWithHealth[]>(
    () =>
      (result?.accounts ?? []).map((a) => ({
        ...a,
        health: healthFor(a),
        handle: handleFor(a),
        reconnectHref: reconnectUrl(a),
      })),
    [result?.accounts],
  );
  const broken = useMemo(
    () => accounts.filter((a) => a.health === "expired"),
    [accounts],
  );

  return {
    accounts,
    /** Accounts whose sign-in expired (need reconnect). */
    broken,
    accountLimit: result?.accountLimit ?? null,
    canManageConnections: result?.canManageConnections ?? true,
    canAccessBilling: result?.canAccessBilling ?? true,
    isLoading: query.isLoading,
    /** Showing the quick list while the live token check still runs. */
    checking: query.isPlaceholderData,
    isError: query.isError || (query.data != null && !query.data.ok),
    refetch: query.refetch,
  };
}
