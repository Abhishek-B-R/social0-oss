import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { formatInTimeZone } from "date-fns-tz";
import { BarChart3, RotateCw } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  FilterChip,
  InlineError,
  NetworkIcon,
  PageContainer,
  PageHeader,
  Skeleton,
  SkeletonPageHeader,
  openComposer,
  useAccountHealth,
  useDashboardPath,
} from "@/components/app";
import Link from "@/components/AppLink";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import {
  getAnalyticsOverview,
  listAnalyticsAccounts,
  type AnalyticsAccount,
  type AnalyticsOverview,
} from "@/api/analytics";
import { getUserSettingsSnapshot } from "@/api/settings";
import { listWorkspaces } from "@/api/team";
import { useSession } from "@/lib/auth-client";
import { relativeTime } from "@/lib/date-format";
import { WINDOW_PRESETS, type DateWindow, type WindowPreset } from "@/lib/date-window";
import { PAGE_LIVE_QUERY } from "@/lib/page-live-query";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import { cn } from "@/lib/utils";
import { ExperimentalBadge } from "@/components/dashboard/ExperimentalBadge";
import {
  MetricTrendChart,
  TrendChartViewToggle,
  TrendLegend,
  type TrendChartView,
  type TrendCompare,
} from "./AnalyticsCharts";
import { AnalyticsRangeControl } from "./AnalyticsRangeControl";
import {
  BreakdownCard,
  Highlights,
  KpiTabs,
  TopPostsCard,
  type ReconnectTarget,
} from "./AnalyticsSections";
import {
  DEFAULT_RANGE,
  METRICS,
  buildHighlights,
  buildSeriesRows,
  handleOf,
  isMetricKey,
  kpiTotals,
  metricMeta,
  previousPeriodWords,
  previousWindow,
  rangeWords,
  skippedCount,
  type MetricKey,
} from "./analytics-model";
import { formatRangeLabel } from "./analytics-utils";

/** Previous-period numbers move slowly; keep them warm across chip toggles. */
const PREVIOUS_QUERY = {
  ...PAGE_LIVE_QUERY,
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
};

export function AnalyticsPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const { ready: permissionsReady, canViewAnalytics, canCreatePosts } =
    useWorkspaceNavPermissions();

  if (sessionPending) return <AnalyticsSkeleton />;

  if (!session) {
    return (
      <GuestPostsPageView
        pageTitle="Analytics"
        promptTitle="Sign in to see analytics"
        promptDescription="Once you publish, Social0 pulls likes, views, and engagement live from each platform."
      />
    );
  }

  if (!permissionsReady) return <AnalyticsSkeleton />;

  if (!canViewAnalytics) {
    return (
      <PageContainer>
        <PageHeader title="Analytics" />
        <EmptyState
          icon={<BarChart3 aria-hidden />}
          title="Analytics isn't part of your role"
          description="Ask a team admin to switch you to Member, Analyst, or Admin."
        />
      </PageContainer>
    );
  }

  return <AnalyticsView canCreatePosts={canCreatePosts} />;
}

// ---------------------------------------------------------------------------
// URL state: ?range=28d | custom&since=&until= · ?account=<id> · ?metric=views

function useAnalyticsUrlState() {
  const [params, setParams] = useSearchParams();
  const rawRange = params.get("range");
  const since = params.get("since") ?? undefined;
  const until = params.get("until") ?? undefined;
  const dateWindow = useMemo<DateWindow>(() => {
    if (rawRange === "custom" && since && until) {
      return { range: "custom", since, until };
    }
    if (rawRange && (WINDOW_PRESETS as readonly string[]).includes(rawRange)) {
      return { range: rawRange as WindowPreset };
    }
    return { range: DEFAULT_RANGE };
  }, [rawRange, since, until]);

  const accountId = params.get("account") || null;
  const rawMetric = params.get("metric");
  const metric = isMetricKey(rawMetric) ? rawMetric : null;

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setWindow = useCallback(
    (w: DateWindow) => {
      if (w.range === "custom") {
        update({ range: "custom", since: w.since ?? null, until: w.until ?? null });
      } else {
        update({
          range: w.range === DEFAULT_RANGE ? null : w.range,
          since: null,
          until: null,
        });
      }
    },
    [update],
  );

  const setAccountId = useCallback(
    (id: string | null) => update({ account: id }),
    [update],
  );
  // `null` clears ?metric= so the view falls back to its data-driven default.
  const setMetric = useCallback(
    (m: MetricKey | null) => update({ metric: m }),
    [update],
  );

  return { window: dateWindow, setWindow, accountId, setAccountId, metric, setMetric };
}

function windowKey(w: DateWindow): string {
  return w.range === "custom" ? `custom:${w.since}:${w.until}` : w.range;
}

function overviewParams(w: DateWindow) {
  return w.range === "custom"
    ? { range: "custom" as const, since: w.since, until: w.until }
    : { range: w.range };
}

// ---------------------------------------------------------------------------

function AnalyticsView({ canCreatePosts }: { canCreatePosts: boolean }) {
  const dash = useDashboardPath();
  const qc = useQueryClient();
  const panelId = useId().replace(/:/g, "");
  const url = useAnalyticsUrlState();
  const [view, setView] = useState<TrendChartView>("line");
  const [compareChoice, setCompareChoice] = useState<TrendCompare>("previous");
  // Tagged with the view it belongs to, so it clears when the range/account changes.
  const [refreshFailure, setRefreshFailure] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["user-settings-snapshot"],
    queryFn: getUserSettingsSnapshot,
    staleTime: 5 * 60_000,
  });
  const settingsTimeZone = settingsQuery.data?.timezone?.trim() || "UTC";

  const workspacesQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
  });
  const workspaceReady = workspacesQuery.isSuccess || workspacesQuery.isError;
  const workspaceId =
    workspacesQuery.data?.workspaces.find((w) => w.isActive)?.id ?? "main";

  const accountsQuery = useQuery({
    queryKey: ["analytics-accounts", workspaceId],
    queryFn: listAnalyticsAccounts,
    enabled: workspaceReady,
    ...PAGE_LIVE_QUERY,
  });
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const health = useAccountHealth();

  // An account id from the URL must belong to this workspace. Wait for the
  // list before fetching a single-account view; drop stale ids.
  const accountsSettled = accountsQuery.isSuccess || accountsQuery.isError;
  const accountKnown =
    url.accountId == null ||
    accountsQuery.isError ||
    accounts.some((a) => a.id === url.accountId);
  const { accountId: urlAccountId, setAccountId } = url;
  useEffect(() => {
    if (!accountsQuery.isSuccess || urlAccountId == null) return;
    if (!accounts.some((a) => a.id === urlAccountId)) setAccountId(null);
  }, [accountsQuery.isSuccess, accounts, urlAccountId, setAccountId]);
  const accountId = accountKnown ? url.accountId : null;

  const wKey = windowKey(url.window);
  const overviewKey = useMemo(
    () => ["analytics-overview", workspaceId, wKey, accountId] as const,
    [workspaceId, wKey, accountId],
  );
  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () =>
      getAnalyticsOverview({
        ...overviewParams(url.window),
        accountId: accountId ?? undefined,
      }),
    enabled: workspaceReady && (url.accountId == null || (accountsSettled && accountKnown)),
    ...PAGE_LIVE_QUERY,
  });
  const data = overviewQuery.data;
  // Day buckets come from the server, in the zone it used (the workspace
  // owner's in a team). Read every day key, label and picker bound in that
  // same zone; the viewer's own setting is only a fallback before it loads.
  const timeZone = data?.timeZone || settingsTimeZone;

  // Previous equal-length window, fetched only after the main one rendered.
  const prevWindow = data ? previousWindow(data.since, data.until) : null;
  const prevQuery = useQuery({
    queryKey: ["analytics-overview-prev", workspaceId, wKey, accountId, data?.since ?? null],
    queryFn: () =>
      getAnalyticsOverview({
        range: "custom",
        since: prevWindow!.since,
        until: prevWindow!.until,
        accountId: accountId ?? undefined,
      }),
    enabled: !!prevWindow && !overviewQuery.isFetching,
    ...PREVIOUS_QUERY,
  });
  const prevData = prevWindow ? prevQuery.data : undefined;

  const refreshing = overviewQuery.isFetching;
  const viewKey = overviewKey.join("|");
  const refreshError = refreshFailure === viewKey;
  const refresh = () => {
    setRefreshFailure(null);
    qc.fetchQuery({
      queryKey: overviewKey,
      queryFn: () =>
        getAnalyticsOverview({
          ...overviewParams(url.window),
          accountId: accountId ?? undefined,
          fresh: true,
        }),
      // Without this, fetchQuery honours staleTime and returns the cache.
      staleTime: 0,
    }).catch(() => {
      setRefreshFailure(viewKey);
    });
  };

  const totals = useMemo(() => (data ? kpiTotals(data) : null), [data]);
  const prevTotals = useMemo(() => (prevData ? kpiTotals(prevData) : null), [prevData]);
  const seriesRows = useMemo(
    () => (data ? buildSeriesRows(data, timeZone) : []),
    [data, timeZone],
  );
  const prevRows = useMemo(
    () => (prevData ? buildSeriesRows(prevData, timeZone) : null),
    [prevData, timeZone],
  );
  const highlights = useMemo(
    () => (data ? buildHighlights(data, timeZone) : []),
    [data, timeZone],
  );

  // With no ?metric=, show Views unless nothing in view reports views (e.g.
  // LinkedIn / Bluesky only), then Engagement. Only the default is left out of
  // the URL, so picking Views while the default is Engagement still sticks.
  const defaultMetric: MetricKey =
    totals && totals.views == null && totals.engagement != null ? "engagement" : "views";
  const metric: MetricKey = url.metric ?? defaultMetric;
  const { setMetric: setUrlMetric } = url;
  const selectMetric = useCallback(
    (m: MetricKey) => setUrlMetric(m === defaultMetric ? null : m),
    [setUrlMetric, defaultMetric],
  );
  const compare: TrendCompare = compareChoice === metric ? "previous" : compareChoice;

  const todayKey = safeDayKey(new Date().toISOString(), timeZone);
  const ongoingToday =
    seriesRows.length > 0 && seriesRows[seriesRows.length - 1]!.date === todayKey;

  // Accounts that can't contribute numbers until they're reconnected.
  const reconnectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of accounts) if (a.missingScopes.length > 0) ids.add(a.id);
    for (const a of data?.accountsNeedingReconnect ?? []) ids.add(a.accountId);
    return ids;
  }, [accounts, data?.accountsNeedingReconnect]);

  const reconnectFor = useCallback(
    (id: string): ReconnectTarget => {
      const acct = health.canManageConnections
        ? health.accounts.find((a) => a.id === id)
        : undefined;
      if (acct) return { href: acct.reconnectHref };
      return { href: dash(`connections?account=${encodeURIComponent(id)}`) };
    },
    [health.accounts, health.canManageConnections, dash],
  );

  const rangeLabel =
    data?.since && data.until ? formatRangeLabel(data.since, data.until, timeZone) : null;
  const prevRangeLabel = prevWindow
    ? formatRangeLabel(prevWindow.since, prevWindow.until, timeZone)
    : null;

  const noAccounts = accountsQuery.isSuccess && accounts.length === 0;
  const emptyRange = !!data && data.publications.length === 0;
  const loadingMain = !data && (overviewQuery.isPending || overviewQuery.isFetching);
  const previousState: "loading" | "ready" | "error" | "off" = !data
    ? "loading"
    : !prevWindow
      ? "off"
      : prevQuery.isError
        ? "error"
        : prevData
          ? "ready"
          : "loading";

  const skipped = data ? skippedCount(data) : 0;

  const header = (
    <PageHeader
      title={
        <span className="inline-flex items-center gap-2">
          Analytics
          <ExperimentalBadge withTip />
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:justify-end">
          <AnalyticsRangeControl
            value={url.window}
            onChange={url.setWindow}
            timeZone={timeZone}
            resolvedSince={data?.since ?? null}
            resolvedUntil={data?.until ?? null}
          />
          <UpdatedLine
            fetchedAt={data?.fetchedAt ?? null}
            refreshing={refreshing}
            onRefresh={refresh}
            disabled={!data && !overviewQuery.isError}
          />
        </div>
      }
    >
      {!noAccounts ? (
        <AccountChips
          accounts={accounts}
          loading={accountsQuery.isPending}
          selectedId={accountId}
          onSelect={setAccountId}
          reconnectIds={reconnectIds}
          reconnectFor={reconnectFor}
        />
      ) : null}
    </PageHeader>
  );

  if (noAccounts) {
    return (
      <PageContainer stack>
        {header}
        <EmptyState
          icon={<BarChart3 aria-hidden />}
          title="No accounts with analytics yet"
          description="Connect an account and publish through Social0. Views, likes, and comments show up here."
          primaryAction={{ label: "Connect account", href: dash("connections?connect=1") }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer stack>
      {header}

      {accountsQuery.isError ? (
        <InlineError
          message="Couldn't load your accounts, so the account filter is hidden."
          onRetry={() => void accountsQuery.refetch()}
        />
      ) : null}

      {overviewQuery.isError && !data ? (
        <ErrorState
          message="Couldn't load analytics."
          detail={overviewQuery.error instanceof Error ? overviewQuery.error.message : null}
          onRetry={() => void overviewQuery.refetch()}
          retrying={overviewQuery.isFetching}
        />
      ) : null}

      {refreshError && data ? (
        <InlineError
          message={`Couldn't refresh. Showing numbers from ${relativeTime(data.fetchedAt, { fallback: "earlier" })}.`}
          onRetry={refresh}
        />
      ) : null}

      {emptyRange ? (
        <EmptyState
          icon={<BarChart3 aria-hidden />}
          title={`No posts published in ${rangeWords(url.window)}`}
          description="Analytics covers posts you publish through Social0. Try a longer range, or publish something and refresh."
          primaryAction={
            url.window.range !== "365d"
              ? {
                  label:
                    url.window.range === "90d" || url.window.range === "custom"
                      ? "Show the last year"
                      : "Show the last 3 months",
                  onClick: () =>
                    url.setWindow({
                      range:
                        url.window.range === "90d" || url.window.range === "custom"
                          ? "365d"
                          : "90d",
                    }),
                }
              : undefined
          }
          secondaryAction={
            canCreatePosts ? { label: "New post", onClick: () => openComposer() } : undefined
          }
        />
      ) : null}

      {!emptyRange && !(overviewQuery.isError && !data) ? (
        <>
          <Highlights items={highlights} />

          <section className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
            <KpiTabs
              totals={totals}
              previous={prevTotals}
              previousState={previousState}
              active={metric}
              onActiveChange={selectMetric}
              previousWords={previousPeriodWords(url.window)}
              loading={loadingMain}
              panelId={panelId}
            />
            <div
              id={panelId}
              role="tabpanel"
              aria-labelledby={`${panelId}-tab-${metric}`}
              className="flex flex-col gap-3 p-4 sm:p-5"
            >
              <CoverageNote
                data={data}
                skipped={skipped}
                onRefresh={refresh}
                refreshing={refreshing}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-text-muted">
                  {metricMeta(metric).label} per day by publish date
                  {rangeLabel ? <>, {rangeLabel}</> : null}
                  {compare === "previous" && prevRangeLabel ? (
                    <span className="text-text-subtle"> · vs {prevRangeLabel}</span>
                  ) : null}
                </p>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                    <span>Compare</span>
                    <select
                      value={compare}
                      onChange={(e) => setCompareChoice(e.target.value as TrendCompare)}
                      className="h-7 rounded-full border border-border bg-bg-elevated px-2.5 text-xs font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-9"
                    >
                      <option value="previous">Previous period</option>
                      {METRICS.filter((m) => m.key !== metric).map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                      <option value="none">Nothing</option>
                    </select>
                  </label>
                  <TrendChartViewToggle value={view} onChange={setView} />
                </div>
              </div>
              {loadingMain ? (
                <Skeleton className="h-56 w-full rounded-lg sm:h-72" />
              ) : (
                <MetricTrendChart
                  rows={seriesRows}
                  previous={prevRows}
                  metric={metric}
                  compare={compare}
                  view={view}
                  ongoingToday={ongoingToday}
                />
              )}
              {!loadingMain ? (
                <TrendLegend
                  metric={metric}
                  compare={compare}
                  hasPrevious={!!prevRows?.length}
                  ongoingToday={ongoingToday}
                  view={view}
                />
              ) : null}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <TopPostsCard
              data={data}
              metric={metric}
              loading={loadingMain}
              postHref={(id) => dash(`posts/${id}`)}
            />
            <BreakdownCard
              data={data}
              metric={metric}
              loading={loadingMain}
              reconnectFor={reconnectFor}
            />
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------

function safeDayKey(iso: string, timeZone: string): string {
  try {
    return formatInTimeZone(iso, timeZone, "yyyy-MM-dd");
  } catch {
    return iso.slice(0, 10);
  }
}

/** Re-render every 30s so "Updated 2m ago" stays honest. */
function useNow(intervalMs = 30_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function UpdatedLine({
  fetchedAt,
  refreshing,
  onRefresh,
  disabled,
}: {
  fetchedAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  disabled: boolean;
}) {
  useNow();
  return (
    <p className="inline-flex items-center gap-2 text-xs text-text-muted">
      {fetchedAt ? (
        <span title={new Date(fetchedAt).toLocaleString()}>
          Updated {relativeTime(fetchedAt, { fallback: "earlier" })}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing || disabled}
        title="Fetch fresh numbers from each network"
        className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 font-medium text-text transition-colors hover:bg-bg-muted disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:min-h-10"
      >
        <RotateCw
          className={cn("size-3", refreshing && "animate-spin motion-reduce:animate-none")}
          aria-hidden
        />
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </p>
  );
}

function AccountChips({
  accounts,
  loading,
  selectedId,
  onSelect,
  reconnectIds,
  reconnectFor,
}: {
  accounts: AnalyticsAccount[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  reconnectIds: Set<string>;
  reconnectFor: (id: string) => ReconnectTarget;
}) {
  if (loading) {
    return (
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
    );
  }
  if (accounts.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Accounts"
      className="scroll-touch flex items-center gap-1.5 overflow-x-auto pb-0.5"
    >
      <FilterChip selected={selectedId == null} onClick={() => onSelect(null)}>
        All accounts
      </FilterChip>
      {accounts.map((a) => {
        const label = handleOf(a.username, a.platform);
        const broken = reconnectIds.has(a.id);
        if (broken && selectedId !== a.id) {
          const target = reconnectFor(a.id);
          return (
            <Link
              key={a.id}
              href={target.href}
              title={`${label} needs to be reconnected before its numbers can be included.`}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-warning-border bg-warning-soft px-3 text-[13px] font-medium text-warning transition-colors hover:border-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10"
            >
              <NetworkIcon network={a.platform} size={14} label="" />
              {label} · reconnect to include
            </Link>
          );
        }
        return (
          <FilterChip
            key={a.id}
            selected={selectedId === a.id}
            onClick={() => onSelect(selectedId === a.id ? null : a.id)}
            icon={<NetworkIcon network={a.platform} size={14} label="" />}
            tone={broken ? "warning" : "default"}
            title={broken ? `${label} needs to be reconnected for full numbers.` : undefined}
          >
            {label}
          </FilterChip>
        );
      })}
    </div>
  );
}

/**
 * One quiet line under the KPI row instead of a marker on every tile.
 * Sampled (the publication list was capped) and partial (the live budget ran
 * out) stay two separate sentences: different causes, different fixes.
 */
function CoverageNote({
  data,
  skipped,
  onRefresh,
  refreshing,
}: {
  data: AnalyticsOverview | undefined;
  skipped: number;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  if (!data || (!data.sampled && !data.partial)) return null;
  return (
    <p className="text-xs text-text-muted">
      {data.sampled ? (
        <span>
          <span className="mr-1 font-medium text-text" aria-hidden>
            ≈
          </span>
          Estimated from the latest {data.sampleLimit} publications in this range.{" "}
        </span>
      ) : null}
      {data.partial ? (
        <>
          <span className="text-warning">
            {skipped > 0
              ? `${skipped} ${skipped === 1 ? "publication" : "publications"} didn't answer in time, so some numbers are missing.`
              : "Some networks didn't answer in time, so some numbers are missing."}
          </span>{" "}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="font-medium text-text underline decoration-border underline-offset-2 hover:decoration-text disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </>
      ) : null}
    </p>
  );
}

function AnalyticsSkeleton() {
  return (
    <PageContainer stack>
      <SkeletonPageHeader />
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-bg-elevated px-4 py-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="mt-2 h-7 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </PageContainer>
  );
}
