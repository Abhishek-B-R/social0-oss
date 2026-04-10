"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadConnectionsPageData } from "@/app/actions/dashboard-data";
import { OAuthErrorHandler } from "@/components/OAuthErrorHandler";
import { ConnectionsList } from "@/components/dashboard/ConnectionsList";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export function ConnectionsPageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<
    Extract<
      Awaited<ReturnType<typeof loadConnectionsPageData>>,
      { ok: true }
    >["data"] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadConnectionsPageData();
      if (cancelled) return;
      if (!result.ok) {
        if (result.error === "Unauthorized") {
          router.replace("/");
          return;
        }
        setError(result.error);
        setLoading(false);
        return;
      }
      setData(result.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {error ?? "Could not load connections."}
      </div>
    );
  }

  return (
    <>
      <OAuthErrorHandler hasUsedTrial={data.hasUsedTrial} />
      <ConnectionsList
        accounts={data.accounts}
        accountLimit={data.accountLimit}
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
