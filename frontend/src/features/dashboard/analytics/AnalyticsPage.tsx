import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { ArrowClockwise } from "@/icons/phosphor";
import { useSession } from "@/lib/auth-client";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { RangeToolbar } from "@/components/dashboard/RangeToolbar";
import { AccountFilterChips } from "@/components/dashboard/AccountFilterChips";
import {
  defaultDateWindow,
  windowQueryParams,
  type DateWindow,
} from "@/lib/date-window";
import { getAnalyticsOverview, listAnalyticsAccounts } from "@/api/analytics";
import { getUserSettingsSnapshot } from "@/api/settings";
import { listWorkspaces } from "@/api/team";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import {
  EngagementTrendChart,
  PlatformBreakdownChart,
  EngagementMixChart,
  TrendChartViewToggle,
  type TrendChartView,
} from "./AnalyticsCharts";
import {
  engagementOf,
  engagementMix,
  formatMetric,
  formatRangeLabel,
  viewsOf,
} from "./analytics-utils";
import { ExperimentalBadge } from "@/components/dashboard/ExperimentalBadge";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import { PAGE_LIVE_QUERY } from "@/lib/page-live-query";
import {
  PAGE_LIVE_POLL_MS,
  useVisibilityPoll,
} from "@/lib/use-visibility-poll";

export function AnalyticsPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const { ready: permissionsReady, canViewAnalytics } =
    useWorkspaceNavPermissions();
  const dash = useDashboardPath();
  const [dateWindow, setDateWindow] = useState<DateWindow>(defaultDateWindow);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [trendChartView, setTrendChartView] = useState<TrendChartView>("line");

  const qc = useQueryClient();
  const workspacesQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: !!session,
  });
  const workspaceReady = workspacesQuery.isSuccess || workspacesQuery.isError;
  const workspaceId =
    workspacesQuery.data?.workspaces.find((w) => w.isActive)?.id ?? "main";

  const accountsQuery = useQuery({
    queryKey: ["analytics-accounts", workspaceId],
    queryFn: listAnalyticsAccounts,
    enabled: !!session && permissionsReady && canViewAnalytics && workspaceReady,
    ...PAGE_LIVE_QUERY,
  });

  const overviewQuery = useQuery({
    queryKey: ["analytics-overview", workspaceId, dateWindow, accountId],
    queryFn: () =>
      getAnalyticsOverview({
        ...windowQueryParams(dateWindow),
        accountId: accountId || undefined,
      }),
    enabled: !!session && permissionsReady && canViewAnalytics && workspaceReady,
    ...PAGE_LIVE_QUERY,
  });

  const pollOverview = useCallback(() => {
    void qc.fetchQuery({
      queryKey: ["analytics-overview", workspaceId, dateWindow, accountId],
      queryFn: () =>
        getAnalyticsOverview({
          ...windowQueryParams(dateWindow),
          accountId: accountId || undefined,
        }),
    });
  }, [qc, workspaceId, dateWindow, accountId]);

  useVisibilityPoll(
    pollOverview,
    PAGE_LIVE_POLL_MS,
    !!session && permissionsReady && canViewAnalytics && workspaceReady,
  );

  const settingsQuery = useQuery({
    queryKey: ["user-settings-snapshot"],
    queryFn: getUserSettingsSnapshot,
    enabled: !!session,
    staleTime: 5 * 60_000,
  });

  const accounts = accountsQuery.data ?? [];

  useEffect(() => {
    if (!accountId || !accountsQuery.isSuccess) return;
    if (!accounts.some((a) => a.id === accountId)) setAccountId(null);
  }, [accountId, accounts, accountsQuery.isSuccess]);

  const reconnect = useMemo(() => {
    const fromOverview = overviewQuery.data?.accountsNeedingReconnect;
    if (fromOverview != null) return fromOverview;
    return accounts
      .filter((a) => a.missingScopes.length > 0)
      .map((a) => ({
        accountId: a.id,
        platform: a.platform,
        username: a.username,
        missingScopes: a.missingScopes,
      }));
  }, [overviewQuery.data, accounts]);

  const platformChart = useMemo(
    () =>
      overviewQuery.data?.byPlatform.map((row) => ({
        platform: row.platform,
        label: PLATFORM_LABEL[row.platform] ?? row.platform,
        views: viewsOf(row.metrics) ?? 0,
        likes: row.metrics.likes ?? 0,
        comments: row.metrics.comments ?? 0,
        shares:
          (row.metrics.shares ?? 0) +
          (row.metrics.reposts ?? 0) +
          (row.metrics.quotes ?? 0),
      })) ?? [],
    [overviewQuery.data?.byPlatform],
  );

  const mixChart = useMemo(
    () =>
      overviewQuery.data ? engagementMix(overviewQuery.data.totals) : [],
    [overviewQuery.data],
  );

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

  if (!permissionsReady) {
    return <AnalyticsSkeleton />;
  }

  if (!canViewAnalytics) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated px-6 text-center">
        <p className="text-sm font-medium text-text">Analytics is not in your role</p>
        <p className="mt-1 max-w-sm text-sm text-text-muted">
          Ask a team admin to switch you to Member, Analyst, or Admin.
        </p>
      </div>
    );
  }

  const data = overviewQuery.data;
  const loading = overviewQuery.isPending;
  const refetching = overviewQuery.isFetching && !overviewQuery.isPending;
  const emptyOverview = !data || data.publications.length === 0;
  const kpi = {
    views: emptyOverview ? undefined : viewsOf(data.totals),
    likes: emptyOverview ? undefined : data.totals.likes,
    comments: emptyOverview ? undefined : data.totals.comments,
    engagement: emptyOverview ? undefined : engagementOf(data.totals),
  };

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const singleAccount = accountId != null;
  const timeZone = settingsQuery.data?.timezone?.trim() || "UTC";
  const rangeLabel =
    data?.since && data?.until
      ? formatRangeLabel(data.since, data.until, timeZone)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2.5 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
            Analytics
            <ExperimentalBadge />
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Live metrics for posts you published through Social0 — not the rest
            of the account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void qc.fetchQuery({
              queryKey: ["analytics-overview", workspaceId, dateWindow, accountId],
              queryFn: () =>
                getAnalyticsOverview({
                  ...windowQueryParams(dateWindow),
                  accountId: accountId || undefined,
                  fresh: true,
                }),
            });
          }}
          disabled={loading || refetching}
          className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text transition-[transform,background-color,color,opacity] duration-150 ease-out hover:bg-bg-subtle active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
        >
          <ArrowClockwise
            className={cn("h-4 w-4", refetching && "animate-spin")}
            size={16}
          />
          Refresh
        </button>
      </div>

      <RangeToolbar
        value={dateWindow}
        onChange={setDateWindow}
        resolvedSince={data?.since}
        resolvedUntil={data?.until}
      />

      <div className="shrink-0">
        <AccountFilterChips
          accounts={accounts}
          selectedId={accountId}
          onSelect={setAccountId}
          loading={accountsQuery.isLoading}
          emptyLabel="Connect an account to see analytics."
        />
      </div>

      {reconnect.length ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">Reconnect for full insights</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-100/80">
            These accounts still have posting access. Reconnect to grant
            analytics scopes for the platforms currently rolled out.
          </p>
          <ul className="mt-2 list-inside list-disc text-xs">
            {reconnect.map((a) => (
              <li key={a.accountId}>
                {PLATFORM_LABEL[a.platform] ?? a.platform}
                {a.username ? ` (@${a.username})` : ""}
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

      <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Views"
          value={formatMetric(kpi.views)}
          loading={loading && !data}
        />
        <StatCard
          label="Likes"
          value={formatMetric(kpi.likes)}
          loading={loading && !data}
        />
        <StatCard
          label="Comments"
          value={formatMetric(kpi.comments)}
          loading={loading && !data}
        />
        <StatCard
          label="Engagement"
          value={formatMetric(kpi.engagement)}
          loading={loading && !data}
        />
      </div>
      {data?.sampled ? (
        <p className="text-xs text-text-muted">
          KPI totals cover the latest {data.sampleLimit} publications in this
          range.
        </p>
      ) : null}
      {data?.partial ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Partial metrics — request budget reached. Refresh to load more.
        </p>
      ) : null}
      {data && data.publications.length === 0 ? (
        <p className="text-sm text-text-muted">
          No posts published through Social0 in this range. Try 4W, or
          publish something and refresh.
        </p>
      ) : data ? (
        <p className="text-xs text-text-muted">
          {data.publications.length} Social0 publication
          {data.publications.length === 1 ? "" : "s"} in this range
          {data.sampled ? ` (latest ${data.sampleLimit})` : ""}.
        </p>
      ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text">
                Performance trend
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Daily totals by publish date for posts in {rangeLabel ?? "this range"}.
                {data?.sampled ? " Showing the most recent sample of posts." : ""}
              </p>
            </div>
            <TrendChartViewToggle
              value={trendChartView}
              onChange={setTrendChartView}
            />
          </div>
          {loading && !data ? (
            <div className="h-64 animate-pulse rounded-xl bg-bg-muted sm:h-72" />
          ) : (
            <EngagementTrendChart
              data={data?.series ?? []}
              view={trendChartView}
            />
          )}
        </section>

        <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm sm:p-5">
          {singleAccount ? (
            <>
              <h2 className="mb-1 text-sm font-semibold text-text">
                Engagement mix
              </h2>
              <p className="mb-4 text-xs text-text-muted">
                How interactions split on{" "}
                {selectedAccount
                  ? `@${handleLabel(selectedAccount.username)}`
                  : "this account"}
                .
              </p>
              {loading && !data ? (
                <div className="h-64 animate-pulse rounded-xl bg-bg-muted sm:h-72" />
              ) : (
                <EngagementMixChart data={mixChart} />
              )}
            </>
          ) : (
            <>
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
            </>
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
              <li
                key={post.postId}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
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

function handleLabel(username: string | null): string {
  if (!username) return "account";
  return username.startsWith("@") ? username.slice(1) : username;
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
    <div className="min-w-0 rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
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
    <div className="flex flex-col gap-6" aria-busy>
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
