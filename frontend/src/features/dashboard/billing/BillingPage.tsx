import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  loadBillingPageData,
  loadDashboardLayoutData,
} from "@/api/dashboard-data";
import { ErrorState, PageContainer, PageHeader, Skeleton } from "@/components/app";
import { fetchApi } from "@/lib/fetch-api";
import type { SubscriptionState } from "@/lib/subscription";
import { toSubscriptionTier } from "@/components/billing/plan-catalog";
import { BillingPanel } from "./BillingPanel";

type BillingData = Extract<
  Awaited<ReturnType<typeof loadBillingPageData>>,
  { ok: true }
>["data"];

function syncBilling() {
  return fetchApi("/api/billing/sync", { method: "POST" }).catch(() => undefined);
}

/** Loading state shaped like the Plan section (plan row + usage meters). */
export function BillingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading billing" className="pt-2">
      <Skeleton className="mb-3 h-4 w-12" />
      <div className="divide-y divide-border border-t border-border [&>*]:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-52" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Billing (personal scope). Rendered at /dashboard/billing (own page header)
 * and inside Settings → Billing (`embedded`: the settings page supplies the
 * title and the content column).
 */
export function BillingPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<BillingData | null>(null);

  const justSubscribed =
    searchParams.get("success") === "1" && searchParams.get("status") !== "failed";

  // Free-post usage comes from the layout query the sidebar already runs.
  const { data: layout } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    retry: false,
  });

  const load = useCallback(
    async (mode: "initial" | "silent" | "retry") => {
      if (mode === "retry") setRetrying(true);
      await syncBilling();
      const result = await loadBillingPageData().catch(() => ({
        ok: false as const,
        error: "network",
      }));
      if (!result.ok) {
        if (result.error === "Unauthorized") {
          navigate("/");
          return;
        }
        // A silent refresh keeps the last good data on screen.
        if (mode !== "silent") setError(result.error);
        setLoading(false);
        setRetrying(false);
        return;
      }
      setError(null);
      setRaw(result.data);
      setLoading(false);
      setRetrying(false);
    },
    [navigate],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Show what we have first. The Dodo sync takes seconds and rarely
      // changes anything, so it runs after and only refreshes quietly.
      const result = await loadBillingPageData().catch(() => ({
        ok: false as const,
        error: "network",
      }));
      if (cancelled) return;
      if (!result.ok) {
        if (result.error === "Unauthorized") {
          navigate("/");
          return;
        }
        setError(result.error);
        setLoading(false);
        return;
      }
      setRaw(result.data);
      setLoading(false);

      await syncBilling();
      if (cancelled) return;
      const synced = await loadBillingPageData().catch(() => null);
      if (!cancelled && synced?.ok) setRaw(synced.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Silent reload after cancel/upgrade/etc — keeps panel props fresh without
  // flipping the page back to the skeleton.
  const reloadBilling = useCallback(() => load("silent"), [load]);

  const subscription: SubscriptionState | null = useMemo(() => {
    if (!raw) return null;
    return {
      subscriptionId: null,
      customerId: null,
      hasUsedTrial: raw.accountLimit.hasUsedTrial,
      pendingPlanTier: null,
      extraAccounts: 0,
      ...raw.subscription,
      tier: toSubscriptionTier(raw.subscription.tier),
      paused: raw.subscription.paused ?? false,
      expiresAt: raw.subscription.expiresAt ? new Date(raw.subscription.expiresAt) : null,
    } as SubscriptionState;
  }, [raw]);

  let body: ReactNode;
  if (loading) {
    body = <BillingSkeleton />;
  } else if (error || !raw || !subscription) {
    body = (
      <ErrorState
        message="Couldn't load billing."
        detail={
          error === "network"
            ? "Check your connection and try again."
            : "Your plan is unchanged. Try again in a moment."
        }
        onRetry={() => void load("retry")}
        retrying={retrying}
      />
    );
  } else {
    body = (
      <BillingPanel
        subscription={subscription}
        accountLimit={raw.accountLimit}
        freePosts={subscription.tier === "free" ? (layout?.freePostsBanner ?? null) : null}
        justSubscribed={justSubscribed}
        dateFormat={raw.dateFormat}
        timezone={raw.timezone}
        onBillingUpdated={reloadBilling}
      />
    );
  }

  if (embedded) return body;
  return (
    <PageContainer>
      <PageHeader title="Billing" />
      {body}
    </PageContainer>
  );
}
