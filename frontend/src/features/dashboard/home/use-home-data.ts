import { useQuery } from "@tanstack/react-query";
import { getHome, type DashboardHomeData } from "@/api/dashboard";
import { fetchApi } from "@/lib/fetch-api";
import { useSession } from "@/lib/auth-client";
import { useTeamId } from "@/components/app";

/** Prefix for every Home query; invalidate `["dashboard-home"]` after mutations. */
export const HOME_QUERY_KEY = ["dashboard-home"] as const;

export function homeQueryKey(scope: string | null) {
  return [...HOME_QUERY_KEY, scope ?? "personal"] as const;
}

async function fetchHome(): Promise<DashboardHomeData> {
  const res = await getHome();
  if (!res.ok) throw new Error(res.error || "Couldn't load your home page.");
  return res.data;
}

/**
 * `dashboard.getHome` for the current workspace. DB-only and cheap, so it
 * refetches on focus to keep "Needs attention" honest. Shared by the Home
 * page and the sidebar SetupPill (same key, one request).
 */
export function useHomeData(options?: { enabled?: boolean }) {
  const { data: session } = useSession();
  const teamId = useTeamId();
  return useQuery({
    queryKey: homeQueryKey(teamId),
    queryFn: fetchHome,
    enabled: !!session && (options?.enabled ?? true),
    staleTime: 20_000,
    // DB-only, so cheap: refresh on return to the tab, and poll while
    // something is publishing so Today's dots settle without a reload.
    refetchOnWindowFocus: true,
    // Always refresh when Home opens: the setup checklist and Needs attention
    // change from other pages (API keys, accounts, queue) that don't know
    // about this query. Cached data shows instantly meanwhile.
    refetchOnMount: "always",
    refetchInterval: (query) =>
      (query.state.data?.counts.publishing ?? 0) > 0 ? 10_000 : false,
  });
}

export type NextQueueSlot = {
  slotId: string;
  scheduledAt: string;
  timezone: string;
};

async function fetchNextSlot(): Promise<NextQueueSlot | null> {
  const res = await fetchApi("/api/queue/next-slot");
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    available?: boolean;
    slotId?: string;
    scheduledAt?: string;
    scheduledFor?: string;
    timezone?: string;
  } | null;
  if (!data?.available || !data.slotId) return null;
  const at = data.scheduledAt ?? data.scheduledFor;
  if (!at) return null;
  return { slotId: data.slotId, scheduledAt: at, timezone: data.timezone ?? "UTC" };
}

/** Next free queue slot (`GET /api/queue/next-slot`), or null when there is no queue. */
export function useNextQueueSlot(enabled: boolean) {
  const teamId = useTeamId();
  return useQuery({
    queryKey: ["queue-next-slot", teamId ?? "personal"],
    queryFn: fetchNextSlot,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
