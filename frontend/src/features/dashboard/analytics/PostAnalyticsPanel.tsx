import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, ExternalLink, RotateCw, TriangleAlert } from "lucide-react";
import Link from "@/components/AppLink";
import {
  ErrorState,
  NetworkIcon,
  Skeleton,
  useAccountHealth,
  useDashboardPath,
} from "@/components/app";
import { getPostAnalytics } from "@/api/analytics";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { engagementOf, formatMetric, viewsOf } from "./analytics-utils";
import { engagementRate, formatRate, handleOf } from "./analytics-model";

/**
 * Post-level analytics ("Performance" on post detail). Stays collapsed until
 * the user asks: opening it is what triggers the live platform fetch.
 */
export function PostAnalyticsPanel({
  postId,
  enabled,
}: {
  postId: string;
  /** Only fetch when the user opens the panel and the post has published pubs. */
  enabled: boolean;
}) {
  const dash = useDashboardPath();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const health = useAccountHealth({ enabled: enabled && open });

  const queryKey = ["post-analytics", postId];
  const query = useQuery({
    queryKey,
    queryFn: () => getPostAnalytics(postId),
    enabled: enabled && open,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  if (!enabled) return null;

  // An explicit Refresh bypasses the server's platform-read cache; a plain
  // refetch would return the same cached numbers for minutes. A failure lands
  // in the query's error state, which the panel already reports.
  const refresh = () => {
    qc.fetchQuery({
      queryKey,
      queryFn: () => getPostAnalytics(postId, { fresh: true }),
      // Without this, fetchQuery honours staleTime and returns the cache.
      staleTime: 0,
    }).catch(() => {});
  };

  const reconnectHref = (accountId: string) => {
    const acct = health.canManageConnections
      ? health.accounts.find((a) => a.id === accountId)
      : undefined;
    return acct?.reconnectHref ?? dash(`connections?account=${encodeURIComponent(accountId)}`);
  };

  const data = query.data;
  const panelId = `post-analytics-${postId}`;

  return (
    <section className="rounded-xl border border-border bg-bg-elevated">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <h2 className="min-w-0 text-sm font-semibold text-text">Performance</h2>
        <div className="flex flex-wrap items-center gap-2">
          {open ? (
            <button
              type="button"
              onClick={refresh}
              disabled={query.isFetching}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10"
            >
              <RotateCw
                className={cn("size-3.5", query.isFetching && "animate-spin motion-reduce:animate-none")}
                aria-hidden
              />
              {query.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10"
          >
            {open ? "Hide analytics" : "Show analytics"}
            <ChevronDown
              className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {open ? (
        <div id={panelId} className="border-t border-border px-4 py-4 sm:px-5">
          {query.isPending ? (
            <div className="space-y-3" aria-busy>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-20 rounded-lg" />
            </div>
          ) : query.isError && !data ? (
            <ErrorState
              compact
              message="Couldn't load this post's analytics."
              detail={query.error instanceof Error ? query.error.message : null}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          ) : !data || data.publications.length === 0 ? (
            <p className="text-sm text-text-muted">
              No published platform posts to analyze yet.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Views" value={formatMetric(viewsOf(data.totals))} />
                <MiniStat label="Likes" value={formatMetric(data.totals.likes)} />
                <MiniStat label="Comments" value={formatMetric(data.totals.comments)} />
                <MiniStat
                  label="Engagements"
                  value={formatMetric(engagementOf(data.totals))}
                  hint={(() => {
                    const rate = engagementRate(data.totals);
                    return rate == null ? undefined : `${formatRate(rate)} of views`;
                  })()}
                />
              </div>

              {/* Partial (live budget ran out) is its own caveat. */}
              {data.partial ? (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-warning">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                  Partial: some networks didn't answer in time.
                  <button
                    type="button"
                    onClick={() => void query.refetch()}
                    disabled={query.isFetching}
                    className="font-medium text-text underline underline-offset-2 hover:no-underline disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </p>
              ) : null}

              {query.isError ? (
                <p role="alert" className="text-xs text-danger">
                  Couldn't refresh. Showing the last numbers we got.
                </p>
              ) : null}

              {data.accountsNeedingReconnect.length > 0 ? (
                <ul className="space-y-1">
                  {data.accountsNeedingReconnect.map((a) => (
                    <li
                      key={a.accountId}
                      className="flex flex-wrap items-center gap-2 text-xs text-warning"
                    >
                      <NetworkIcon network={a.platform} size={14} label="" />
                      <span className="min-w-0 flex-1">
                        {handleOf(a.username, a.platform)} needs to be reconnected for full numbers.
                      </span>
                      <Link
                        href={reconnectHref(a.accountId)}
                        className="font-semibold underline underline-offset-2 hover:no-underline"
                      >
                        Reconnect
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}

              <ul className="divide-y divide-border border-y border-border">
                {data.publications.map((pub) => (
                  <li key={pub.publicationId} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-text">
                        <NetworkIcon network={pub.platform} size={16} label="" />
                        <span className="truncate">
                          {PLATFORM_LABEL[pub.platform] ?? pub.platform}
                          {pub.accountLabel ? (
                            <span className="font-normal text-text-muted">
                              {" "}
                              · {handleOf(pub.accountLabel, pub.platform)}
                            </span>
                          ) : null}
                        </span>
                      </p>
                      {pub.platformPostUrl ? (
                        <a
                          href={pub.platformPostUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                        >
                          View on {PLATFORM_LABEL[pub.platform] ?? "platform"}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                    {pub.status !== "ok" && pub.error ? (
                      <p className="mt-1 text-xs text-warning">{pub.error}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                      <MetricChip label="Views" value={viewsOf(pub.metrics)} />
                      <MetricChip label="Likes" value={pub.metrics.likes} />
                      <MetricChip label="Comments" value={pub.metrics.comments} />
                      <MetricChip label="Shares" value={pub.metrics.shares} />
                      <MetricChip label="Reposts" value={pub.metrics.reposts} />
                      <MetricChip label="Quotes" value={pub.metrics.quotes} />
                      <MetricChip label="Reach" value={pub.metrics.reach} />
                      <MetricChip label="Saves" value={pub.metrics.saves} />
                      <MetricChip label="Clicks" value={pub.metrics.clicks} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-muted">
                Fetched {new Date(data.fetchedAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-text">{value}</p>
      {hint ? <p className="text-xs text-text-subtle">{hint}</p> : null}
    </div>
  );
}

function MetricChip({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  if (value == null) return null;
  return (
    <span>
      <span className="font-semibold text-text">{formatMetric(value)}</span>{" "}
      {label.toLowerCase()}
    </span>
  );
}
