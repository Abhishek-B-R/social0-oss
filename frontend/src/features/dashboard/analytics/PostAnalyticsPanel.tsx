import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "@/components/AppLink";
import { ChartLine, ArrowClockwise } from "@/icons/phosphor";
import { getPostAnalytics } from "@/api/analytics";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import {
  PLATFORM_LABEL,
  engagementOf,
  formatMetric,
  viewsOf,
} from "./analytics-utils";
import { cn } from "@/lib/utils";

export function PostAnalyticsPanel({
  postId,
  enabled,
}: {
  postId: string;
  /** Only fetch when the post has published publications. */
  enabled: boolean;
}) {
  const dash = useDashboardPath();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["post-analytics", postId],
    queryFn: () => getPostAnalytics(postId),
    enabled: enabled && open,
    staleTime: 60_000,
  });

  if (!enabled) return null;

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h2 className="text-base font-semibold text-text">Post analytics</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Live likes, views, and engagement from each platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {open ? (
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-bg-subtle disabled:opacity-60"
            >
              <ArrowClockwise
                className={cn("h-4 w-4", query.isFetching && "animate-spin")}
                size={16}
              />
              Refresh
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
          >
            <ChartLine size={16} weight="bold" />
            {open ? "Hide analytics" : "Show analytics"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border px-6 py-5">
          {query.isLoading ? (
            <div className="space-y-3" aria-busy>
              <div className="h-10 animate-pulse rounded-lg bg-bg-muted" />
              <div className="h-24 animate-pulse rounded-lg bg-bg-muted" />
            </div>
          ) : query.isError ? (
            <p className="text-sm text-red-600 dark:text-red-300">
              {query.error instanceof Error
                ? query.error.message
                : "Failed to load analytics"}
            </p>
          ) : !query.data || query.data.publications.length === 0 ? (
            <p className="text-sm text-text-muted">
              No published platform posts to analyze yet.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Views" value={formatMetric(viewsOf(query.data.totals))} />
                <MiniStat
                  label="Likes"
                  value={formatMetric(query.data.totals.likes)}
                />
                <MiniStat
                  label="Comments"
                  value={formatMetric(query.data.totals.comments)}
                />
                <MiniStat
                  label="Engagement"
                  value={formatMetric(engagementOf(query.data.totals))}
                />
              </div>

              {query.data.accountsNeedingReconnect.length > 0 ? (
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Some accounts need reconnect for full insights.{" "}
                  <Link
                    href={dash("connections")}
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Connections
                  </Link>
                </p>
              ) : null}

              <ul className="space-y-3">
                {query.data.publications.map((pub) => (
                  <li
                    key={pub.publicationId}
                    className="rounded-xl border border-border bg-bg px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-text">
                          {PLATFORM_LABEL[pub.platform] ?? pub.platform}
                          {pub.accountLabel ? ` · ${pub.accountLabel}` : ""}
                        </p>
                        {pub.status !== "ok" && pub.error ? (
                          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                            {pub.error}
                          </p>
                        ) : null}
                      </div>
                      {pub.platformPostUrl ? (
                        <a
                          href={pub.platformPostUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          View on platform
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                      <MetricChip label="Views" value={viewsOf(pub.metrics)} />
                      <MetricChip label="Likes" value={pub.metrics.likes} />
                      <MetricChip
                        label="Comments"
                        value={pub.metrics.comments}
                      />
                      <MetricChip label="Shares" value={pub.metrics.shares} />
                      <MetricChip label="Reposts" value={pub.metrics.reposts} />
                      <MetricChip label="Reach" value={pub.metrics.reach} />
                      <MetricChip label="Saves" value={pub.metrics.saves} />
                      <MetricChip label="Clicks" value={pub.metrics.clicks} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-muted">
                Fetched {new Date(query.data.fetchedAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="text-lg font-semibold text-text">{value}</p>
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
