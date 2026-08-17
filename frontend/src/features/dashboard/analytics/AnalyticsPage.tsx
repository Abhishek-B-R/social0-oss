import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "@/components/AppLink";
import { ArrowClockwise } from "@/icons/phosphor";
import { useSession } from "@/lib/auth-client";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import {
  getAnalyticsOverview,
  listAnalyticsAccounts,
  type AnalyticsRange,
} from "@/api/analytics";
import {
  EngagementTrendChart,
  PlatformBreakdownChart,
} from "./AnalyticsCharts";
import {
  RANGE_OPTIONS,
  PLATFORM_LABEL,
  engagementOf,
  formatMetric,
  viewsOf,
} from "./analytics-utils";
import { cn } from "@/lib/utils";

export function AnalyticsPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const dash = useDashboardPath();
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [accountId, setAccountId] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["analytics-accounts"],
    queryFn: listAnalyticsAccounts,
    enabled: !!session,
  });

  const overviewQuery = useQuery({
    queryKey: ["analytics-overview", range, accountId],
    queryFn: () =>
      getAnalyticsOverview({ range, accountId: accountId || undefined }),
    enabled: !!session,
    staleTime: 60_000,
  });

  if (sessionPending) {
    return <AnalyticsSkeleton />;
  }

  if (!session) {
    return (
      <GuestPostsPageView
        pageTitle="Analytics"
        pageDescription="Live performance from your connected social accounts."
        promptTitle="Sign in to see analytics"
        promptDescription="Once you publish, Social0 pulls likes, views, and engagement live from each platform."
      />
    );
  }

  const data = overviewQuery.data;
  const loading = overviewQuery.isLoading || overviewQuery.isFetching;

  const platformChart =
    data?.byPlatform.map((row) => ({
      platform: row.platform,
      label: PLATFORM_LABEL[row.platform] ?? row.platform,
      views: viewsOf(row.metrics),
      likes: row.metrics.likes ?? 0,
      comments: row.metrics.comments ?? 0,
      shares:
        (row.metrics.shares ?? 0) +
        (row.metrics.reposts ?? 0) +
        (row.metrics.quotes ?? 0),
    })) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-2 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
            Analytics
          </h1>
          <p className="text-sm text-text-muted">
            Live metrics from platforms for posts published in this range.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void overviewQuery.refetch()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-60"
        >
          <ArrowClockwise
            className={cn("h-4 w-4", loading && "animate-spin")}
            size={16}
          />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRange(opt.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              range === opt.value
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-bg-elevated text-text hover:bg-bg-subtle",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {(accountsQuery.data?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAccountId(null)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              accountId == null
                ? "bg-sidebar-active text-text"
                : "border border-border text-text-muted hover:bg-bg-subtle",
            )}
          >
            All accounts
          </button>
          {accountsQuery.data?.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccountId(a.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                accountId === a.id
                  ? "bg-sidebar-active text-text"
                  : "border border-border text-text-muted hover:bg-bg-subtle",
              )}
            >
              {PLATFORM_LABEL[a.platform] ?? a.platform}
              {a.username ? ` · ${a.username}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {data?.accountsNeedingReconnect?.length ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">Reconnect for full insights</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-100/80">
            Some accounts are missing analytics scopes. Publishing still works —
            reconnect to unlock views/reach where required.
          </p>
          <ul className="mt-2 list-inside list-disc text-xs">
            {data.accountsNeedingReconnect.map((a) => (
              <li key={a.accountId}>
                {PLATFORM_LABEL[a.platform] ?? a.platform}
                {a.username ? ` (@${a.username})` : ""}:{" "}
                {a.missingScopes.join(", ")}
              </li>
            ))}
          </ul>
          <Link
            href={dash("connections")}
            className="mt-2 inline-block text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            Open Connections
          </Link>
        </div>
      ) : null}

      {overviewQuery.isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "Failed to load analytics"}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Views"
          value={formatMetric(data ? viewsOf(data.totals) : undefined)}
          loading={loading && !data}
        />
        <StatCard
          label="Likes"
          value={formatMetric(data?.totals.likes)}
          loading={loading && !data}
        />
        <StatCard
          label="Comments"
          value={formatMetric(data?.totals.comments)}
          loading={loading && !data}
        />
        <StatCard
          label="Engagement"
          value={formatMetric(data ? engagementOf(data.totals) : undefined)}
          loading={loading && !data}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm sm:p-5">
          <h2 className="mb-1 text-sm font-semibold text-text">
            Views & engagement over time
          </h2>
          <p className="mb-4 text-xs text-text-muted">
            Based on publish date of each post (live platform totals).
          </p>
          {loading && !data ? (
            <div className="h-64 animate-pulse rounded-xl bg-bg-muted sm:h-72" />
          ) : (
            <EngagementTrendChart data={data?.series ?? []} />
          )}
        </section>

        <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm sm:p-5">
          <h2 className="mb-1 text-sm font-semibold text-text">
            By platform
          </h2>
          <p className="mb-4 text-xs text-text-muted">
            Totals across publications in this range.
          </p>
          {loading && !data ? (
            <div className="h-64 animate-pulse rounded-xl bg-bg-muted sm:h-72" />
          ) : (
            <PlatformBreakdownChart data={platformChart} />
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm sm:p-5">
        <h2 className="mb-1 text-sm font-semibold text-text">Top posts</h2>
        <p className="mb-4 text-xs text-text-muted">
          Ranked by views + engagement from live platform data.
        </p>
        {!data || data.topPosts.length === 0 ? (
          <p className="text-sm text-text-muted">
            {loading
              ? "Loading…"
              : "No published posts with metrics in this range."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.topPosts.map((post) => (
              <li key={post.postId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={dash(`posts/${post.postId}`)}
                    className="line-clamp-2 text-sm font-medium text-text hover:text-accent"
                  >
                    {post.snippet}
                  </Link>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {post.platforms
                      .map((p) => PLATFORM_LABEL[p] ?? p)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-4 text-xs text-text-muted">
                  <span>
                    <span className="font-semibold text-text">
                      {formatMetric(viewsOf(post.metrics))}
                    </span>{" "}
                    views
                  </span>
                  <span>
                    <span className="font-semibold text-text">
                      {formatMetric(engagementOf(post.metrics))}
                    </span>{" "}
                    eng.
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data?.sampled ? (
          <p className="mt-3 text-xs text-text-muted">
            Showing the latest {data.sampleLimit} publications in this range for
            live accuracy.
          </p>
        ) : null}
        {data?.fetchedAt ? (
          <p className="mt-2 text-xs text-text-muted">
            Fetched {new Date(data.fetchedAt).toLocaleString()}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-bg-muted" />
      ) : (
        <p className="mt-1 font-logo text-2xl tracking-tight text-foreground sm:text-3xl">
          {value}
        </p>
      )}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6" aria-busy>
      <div>
        <div className="h-10 w-48 animate-pulse rounded bg-bg-muted" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl bg-bg-muted"
          />
        ))}
      </div>
    </div>
  );
}
