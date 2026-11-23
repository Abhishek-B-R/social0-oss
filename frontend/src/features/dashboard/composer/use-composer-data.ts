import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { rpc } from "@/lib/rpc";
import { useSession } from "@/lib/auth-client";
import {
  transformAccountsForForm,
  type ApiAccountRow,
} from "@/lib/accounts-for-form";
import { getPlanLimits, type SubscriptionTier } from "@/lib/plans";
import { toSubscriptionTier } from "@/components/billing/plan-catalog";
import { getUserSettingsSnapshot } from "@/api/settings";
import { getAnalyticsOverview, type PublicationMetrics } from "@/api/analytics";
import { normalizeDateFormat } from "@/lib/date-format";
import { useAccountHealth } from "@/components/app";
import { getFreePostsRemaining } from "@/lib/free-tier-publish";
import type { ComposerAccount } from "./types";

/**
 * Connected accounts for the composer (`GET /api/accounts`, same source the
 * old forms used), merged with the sidebar's health data for Instagram's
 * connection method (reconnect link). Inactive accounts are left out.
 * Query key lives under ["connections"] so a workspace switch refetches it.
 */
export function useComposerAccounts(enabled: boolean) {
  const query = useQuery({
    queryKey: ["connections", "composer-accounts"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetchApi("/api/accounts");
      if (res.status === 401) return [] as ApiAccountRow[];
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Couldn't load your accounts.");
      }
      return (await res.json()) as ApiAccountRow[];
    },
  });
  const health = useAccountHealth({ enabled });
  const accounts = useMemo<ComposerAccount[]>(() => {
    const rows = transformAccountsForForm(query.data ?? [], null);
    return rows.map((a) => ({
      ...a,
      connectionMethod:
        health.accounts.find((h) => h.id === a.id)?.connectionMethod ?? null,
    }));
  }, [query.data, health.accounts]);
  return {
    accounts,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    canManageConnections: health.canManageConnections,
  };
}

export type ComposerSettings = {
  tier: SubscriptionTier;
  freePostsUsed: number;
  freePostsRemaining: number | null;
  allowAutoPlug: boolean;
  allowAutoRepost: boolean;
  timezone: string;
  use24h: boolean;
  dateFormat: string;
  loaded: boolean;
};

/**
 * Plan + preferences. A lapsed subscription counts as Free, as it did on
 * the old create page (payment failed → expired → free limits); the server
 * decides when that is.
 */
export function useComposerSettings(): ComposerSettings {
  const { data: session } = useSession();
  const composer = useQuery({
    queryKey: ["composer-settings"],
    enabled: !!session,
    queryFn: () =>
      rpc<{
        subscriptionTier: SubscriptionTier;
        subscriptionExpiresAt: string | null;
        freePostsUsed: number;
      }>("dashboard-data.loadComposerSettings"),
  });
  const settings = useQuery({
    queryKey: ["settings-snapshot"],
    enabled: !!session,
    queryFn: getUserSettingsSnapshot,
  });

  // The server resolves the effective tier (renewal grace, cancel at period
  // end), so no client-side expiry check: `subscriptionExpiresAt` is Dodo's
  // next billing date, and treating it as the end of access showed paying
  // users the free plan until the renewal webhook landed.
  const raw = composer.data?.subscriptionTier ?? "free";
  const tier: SubscriptionTier = toSubscriptionTier(raw);
  const limits = getPlanLimits(tier);
  const freePostsUsed = composer.data?.freePostsUsed ?? 0;
  return {
    tier,
    freePostsUsed,
    // Unknown until the plan loads: defaulting to "free" here flashed
    // "10/10 free posts left" at paying users on every composer open.
    freePostsRemaining:
      composer.data && tier === "free"
        ? getFreePostsRemaining(tier, freePostsUsed)
        : null,
    allowAutoPlug: limits.allowAutoPlug,
    allowAutoRepost: limits.allowResurface,
    timezone: settings.data?.timezone?.trim() || "UTC",
    use24h: settings.data?.use24HourTimeFormat ?? false,
    dateFormat: normalizeDateFormat(settings.data?.dateFormat),
    loaded: composer.isSuccess && settings.isSuccess,
  };
}

export type NextSlot = {
  slotId: string;
  scheduledAt: string;
  timezone: string;
};

/**
 * Next free queue slot (`GET /api/queue/next-slot`), null when no queue.
 * `exclude`: slot times held by posts still uploading (heldQueueTimes), which
 * the server can't see yet.
 */
export function useNextSlot(enabled: boolean, exclude: readonly string[] = []) {
  const excludeParam = exclude.join(",");
  return useQuery({
    queryKey: excludeParam ? ["queue", "next-slot", excludeParam] : ["queue", "next-slot"],
    enabled,
    staleTime: 30_000,
    // Keep showing the last slot while a new exclude list loads, so the
    // primary button doesn't flash to "Publish now".
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<NextSlot | null> => {
      const res = await fetchApi(
        excludeParam
          ? `/api/queue/next-slot?exclude=${encodeURIComponent(excludeParam)}`
          : "/api/queue/next-slot",
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        available?: boolean;
        slotId?: string;
        scheduledAt?: string;
        scheduledFor?: string;
        timezone?: string;
      };
      const at = data.scheduledAt ?? data.scheduledFor;
      if (!data.available || !data.slotId || !at) return null;
      return { slotId: data.slotId, scheduledAt: at, timezone: data.timezone ?? "UTC" };
    },
  });
}

/**
 * Last 3 months of publications with metrics, for the schedule popover's
 * "Best time" preset. A live analytics read, so it only runs while the
 * popover is open and is cached for half an hour; a failure just hides the
 * preset.
 */
export function useBestTimeHistory(enabled: boolean, scopeKey: string) {
  return useQuery({
    queryKey: ["composer-best-time", scopeKey],
    enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PublicationMetrics[]> =>
      (await getAnalyticsOverview({ range: "90d" })).publications,
  });
}
