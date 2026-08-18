import { useQuery } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import { getPostAnalytics } from "@/api/analytics";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import {
  engagementOf,
  formatMetric,
  viewsOf,
} from "./analytics-utils";

export function PostAnalyticsPanel({
  postId,
  enabled,
}: {
  postId: string;
  enabled: boolean;
}) {
  const dash = useDashboardPath();
  const query = useQuery({
    queryKey: ["post-analytics", postId],
    queryFn: () => getPostAnalytics(postId),
    enabled,
    staleTime: 60_000,
  });

  const totals = query.data?.totals;
  const views = enabled && totals ? formatMetric(viewsOf(totals)) : "—";
  const likes = enabled && totals ? formatMetric(totals.likes) : "—";
  const engagement =
    enabled && totals ? formatMetric(engagementOf(totals)) : "—";

  return (
    <div className="h-full rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text">Post analytics</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Live metrics from platforms that are rolled out.
        </p>
      </div>

      {query.isError ? (
        <p className="text-sm text-red-600 dark:text-red-300">
          {query.error instanceof Error
            ? query.error.message
            : "Failed to load analytics"}
        </p>
      ) : (
        <dl className="space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-text-muted">Views</dt>
            <dd className="font-semibold tabular-nums text-text">
              {query.isLoading ? "…" : views}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-text-muted">Likes</dt>
            <dd className="font-semibold tabular-nums text-text">
              {query.isLoading ? "…" : likes}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-text-muted">Engagement</dt>
            <dd className="font-semibold tabular-nums text-text">
              {query.isLoading ? "…" : engagement}
            </dd>
          </div>
        </dl>
      )}

      <Link
        href={dash("analytics")}
        className="inline-flex text-sm font-medium text-accent hover:text-accent-hover"
      >
        View analytics →
      </Link>
    </div>
  );
}
