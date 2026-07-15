
import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadConnectionsPageData } from "@/api/dashboard-data";
import { OAuthErrorHandler } from "@/components/OAuthErrorHandler";
import { ConnectionsList } from "@/components/dashboard/ConnectionsList";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export function ConnectionsPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [data, setData] = useState<
    | Extract<
        Awaited<ReturnType<typeof loadConnectionsPageData>>,
        { ok: true }
      >["data"]
    | null
  >(null);
  const fetchSeq = useRef(0);

  const handleAccountDisconnected = useCallback((accountId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const removed = prev.accounts.find((a) => a.id === accountId);
      const accounts = prev.accounts.filter((a) => a.id !== accountId);
      const accountLimit =
        prev.accountLimit && removed && removed.isActive !== false
          ? {
              ...prev.accountLimit,
              currentTotal: Math.max(0, prev.accountLimit.currentTotal - 1),
            }
          : prev.accountLimit;
      return { ...prev, accounts, accountLimit };
    });
  }, []);

  /** Re-pulls accounts; silent (no skeleton) unless it's the initial load. */
  const refetch = useCallback(async () => {
    const seq = ++fetchSeq.current;
    const result = await loadConnectionsPageData();
    if (seq !== fetchSeq.current) return; // a newer fetch superseded this one
    if (!result.ok) {
      if (result.error === "Unauthorized") {
        setIsGuest(true);
        setLoading(false);
        return;
      }
      setError(result.error);
      setLoading(false);
      return;
    }
    setIsGuest(false);
    setError(null);
    setData(result.data);
    setLoading(false);
  }, []);

  // Initial load, plus refetch whenever OAuth flows land back here with
  // query params (?connected=..., ?reauth=..., ?error=...).
  useEffect(() => {
    void refetch();
  }, [refetch, searchParams]);

  // Refetch when the tab regains focus - covers OAuth completed in another
  // tab/window and token refreshes done elsewhere.
  useEffect(() => {
    const onFocus = () => void refetch();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refetch]);

  if (loading) {
    return <DashboardPageSkeleton message="Loading connections..." />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {error}
      </div>
    );
  }

  if (isGuest || !data) {
    return (
      <ConnectionsList accounts={[]} accountLimit={undefined} requireAuth />
    );
  }

  return (
    <>
      <OAuthErrorHandler hasUsedTrial={data.hasUsedTrial} />
      <ConnectionsList
        accounts={data.accounts}
        accountLimit={data.accountLimit}
        canManageConnections={data.canManageConnections !== false}
        onAccountDisconnected={handleAccountDisconnected}
        onAccountsChanged={refetch}
      />
      <p className="mt-4 text-sm text-text-muted">
        Having trouble connecting your accounts?{" "}
        <a
          href="mailto:support@social0.app"
          className="font-medium text-primary underline underline-offset-2 hover:no-underline"
        >
          Email support@social0.app
        </a>
      </p>
    </>
  );
}
