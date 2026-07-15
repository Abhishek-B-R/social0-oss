
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { useEffect, useState, useMemo } from "react";
import { loadBillingPageData } from "@/api/dashboard-data";
import type { SubscriptionState } from "@/lib/subscription";
import { BillingPanel } from "./BillingPanel";
import { DOCS_BILLING_URL } from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export function BillingPage() {
  const navigate = useNavigate();
  const invalidateQueries = useInvalidateQueries();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<
    Extract<
      Awaited<ReturnType<typeof loadBillingPageData>>,
      { ok: true }
    >["data"] | null
  >(null);

  const showUpgradeBanner = searchParams.get("upgrade") === "1";
  const justSubscribed =
    searchParams.get("success") === "1" &&
    searchParams.get("status") !== "failed";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadBillingPageData();
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
    })();
    return () => {
      cancelled = true;
    };
  }, [invalidateQueries]);

  const subscription: SubscriptionState | null = useMemo(() => {
    if (!raw) return null;
    return {
      ...raw.subscription,
      expiresAt: raw.subscription.expiresAt
        ? new Date(raw.subscription.expiresAt)
        : null,
    } as SubscriptionState;
  }, [raw]);

  if (loading) {
    return <DashboardPageSkeleton message="Loading billing..." />;
  }

  if (error || !raw || !subscription) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {error ?? "Could not load billing."}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="mb-2 font-serif text-3xl font-semibold tracking-tight text-foreground landing flex items-center gap-2">
          Billing
        </h1>
        <DocsInfoIcon url={DOCS_BILLING_URL} />
      </div>
      <p className="mt-1 text-text-muted">
        Manage your subscription and billing.
      </p>
      {showUpgradeBanner && (
        <div className="mt-6 rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm text-text">
          Upgrade to Growth for bulk tools, auto-plug, and auto-repost — or Pro
          for unlimited accounts and team collaboration.
        </div>
      )}
      <div className="mt-5">
        <BillingPanel
          subscription={subscription}
          accountLimit={raw.accountLimit}
          justSubscribed={justSubscribed}
          dateFormat={raw.dateFormat}
          timezone={raw.timezone}
        />
      </div>
    </div>
  );
}
