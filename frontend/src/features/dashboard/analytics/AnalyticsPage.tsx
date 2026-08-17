import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { ArrowClockwise, SquaresFour } from "@/icons/phosphor";
import { AccountAvatar } from "@/components/AccountAvatar";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useSession } from "@/lib/auth-client";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import {
  getAnalyticsOverview,
  listAnalyticsAccounts,
  type AnalyticsAccount,
  type AnalyticsRange,
} from "@/api/analytics";
import {
  EngagementTrendChart,
  PlatformBreakdownChart,
  EngagementMixChart,
} from "./AnalyticsCharts";
import {
  RANGE_OPTIONS,
  PLATFORM_LABEL,
  engagementOf,
  engagementMix,
  formatMetric,
  formatRangeLabel,
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

  const reconnect = useMemo(() => {
    const fromOverview = overviewQuery.data?.accountsNeedingReconnect ?? [];
    if (fromOverview.length) return fromOverview;
    return (accountsQuery.data ?? [])
      .filter((a) => a.missingScopes.length > 0)
      .map((a) => ({
        accountId: a.id,
        platform: a.platform,
        username: a.username,
        missingScopes: a.missingScopes,
      }));
  }, [overviewQuery.data, accountsQuery.data]);

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

  const selectedAccount = accountsQuery.data?.find((a) => a.id === accountId);
  const singleAccount = accountId != null;
  const rangeLabel =
    data?.since && data?.until
      ? formatRangeLabel(data.since, data.until)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Live metrics for posts you published through Social0 — not the rest
            of the account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void overviewQuery.refetch()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-60"
        >
          <ArrowClockwise
            className={cn("h-4 w-4", loading && "animate-spin")}
            size={16}
          />
          Refresh
        </button>
      </div>

      <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Date range"
          className="inline-flex w-full rounded-full border border-border bg-bg-muted p-1 sm:w-auto"
        >
          {RANGE_OPTIONS.map((opt) => {
            const selected = range === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setRange(opt.value)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors sm:flex-none sm:px-4",
                  selected
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-text-muted hover:text-text",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {rangeLabel ? (
          <p className="text-sm font-medium tabular-nums text-text-muted">
            {rangeLabel}
          </p>
        ) : null}
      </div>

      <div className="shrink-0">
        {accountsQuery.isLoading ? (
          <div className="flex flex-wrap gap-3" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex w-16 flex-col items-center gap-1.5">
                <div className="h-12 w-12 animate-pulse rounded-full bg-bg-muted" />
                <div className="h-2.5 w-12 animate-pulse rounded bg-bg-muted" />
              </div>
            ))}
          </div>
        ) : (accountsQuery.data?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap items-start gap-3">
            <AllAccountsChip
              selected={accountId == null}
              onClick={() => setAccountId(null)}
            />
            {accountsQuery.data?.map((a) => (
              <AccountChip
                key={a.id}
                account={a}
                selected={accountId === a.id}
                onClick={() => setAccountId(a.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Connect an account to see analytics.
          </p>
        )}
      </div>

      {reconnect.length ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">Reconnect for full insights</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-100/80">
            These accounts still have posting access. Reconnect to grant
            analytics scopes — Instagram, Threads, TikTok, and Facebook need an
            extra permission we didn&apos;t ask for when you first connected.
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
      {data && data.publications.length === 0 ? (
        <p className="-mt-3 text-sm text-text-muted">
          No posts published through Social0 in this range. Try 30 days, or
          publish something and refresh.
        </p>
      ) : data ? (
        <p className="-mt-3 text-xs text-text-muted">
          {data.publications.length} Social0 publication
          {data.publications.length === 1 ? "" : "s"} in this range
          {data.sampled ? ` (latest ${data.sampleLimit})` : ""}.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm sm:p-5">
          <h2 className="mb-1 text-sm font-semibold text-text">
            Views & engagement
          </h2>
          <p className="mb-4 text-xs text-text-muted">
            Daily totals across posts published in {rangeLabel ?? "this range"}.
          </p>
          {loading && !data ? (
            <div className="h-64 animate-pulse rounded-xl bg-bg-muted sm:h-72" />
          ) : (
            <EngagementTrendChart data={data?.series ?? []} />
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
                <EngagementMixChart
                  data={data ? engagementMix(data.totals) : []}
                />
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

function AllAccountsChip({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex w-16 flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all",
          selected
            ? "border-accent bg-accent/15 text-accent"
            : "border-transparent bg-bg-muted text-text-muted opacity-70 hover:opacity-100",
        )}
      >
        <SquaresFour size={22} weight={selected ? "fill" : "regular"} />
        {selected ? <SelectedCheck /> : null}
      </span>
      <span
        className={cn(
          "w-full truncate text-center text-[11px] font-semibold",
          selected ? "text-accent" : "text-text-muted",
        )}
      >
        All
      </span>
    </button>
  );
}

function AccountChip({
  account,
  selected,
  onClick,
}: {
  account: AnalyticsAccount;
  selected: boolean;
  onClick: () => void;
}) {
  const needsReconnect = account.missingScopes.length > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={
        needsReconnect
          ? `Reconnect ${PLATFORM_LABEL[account.platform] ?? account.platform} for full insights`
          : `@${handleLabel(account.username)}`
      }
      className="flex w-16 flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-all",
          selected
            ? "border-accent opacity-100"
            : "border-transparent opacity-60 hover:opacity-100",
        )}
      >
        <span className="h-full w-full overflow-hidden rounded-full">
          <AccountAvatar
            profileImageUrl={account.profileImageUrl}
            username={account.username}
            platform={account.platform}
            fill
          />
        </span>
        <span className="absolute bottom-0 right-0 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-bg-elevated bg-bg-elevated">
          <PlatformIcon platform={account.platform} size={11} />
        </span>
        {selected ? <SelectedCheck /> : null}
        {needsReconnect ? (
          <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-amber-500" />
        ) : null}
      </span>
      <span
        className={cn(
          "w-full truncate text-center text-[11px] font-semibold",
          selected ? "text-accent" : "text-text",
        )}
      >
        {handleLabel(account.username)}
      </span>
    </button>
  );
}

function SelectedCheck() {
  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M5 13l4 4L19 7"
        />
      </svg>
    </span>
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
