import { useQuery } from "@tanstack/react-query";
import { getAnalyticsOverview } from "@/api/analytics";
import Link from "@/components/AppLink";
import { useMemo } from "react";
import {
  NetworkIcon,
  networkLabel,
  useAccountHealth,
  useDashboardPath,
  useTeamId,
} from "@/components/app";
import { PAGE_LIVE_QUERY } from "@/lib/page-live-query";
import { pickBestPost } from "./best-post";
import { postTitle } from "./home-format";
import { useShareElsewhere } from "./use-share-elsewhere";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/** "X", "X and Threads", "X, Threads and Bluesky". */
function joinNetworks(networks: string[]): string {
  const names = networks.map(networkLabel);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * "Best post this week". When it did well, suggest taking it to networks it
 * hasn't been on (one account per network, picked in the composer before
 * anything goes out). It never offers to repost to the same network: a copy
 * there reads as spam and X rejects duplicates outright. Analytics are live platform reads, so
 * this loads after the rest of Home and stays hidden on error or no data.
 */
export function BestPostCard({ canPublish }: { canPublish: boolean }) {
  const dash = useDashboardPath();
  const teamId = useTeamId();
  const query = useQuery({
    queryKey: ["analytics-overview", "home-best-post", teamId ?? "personal"],
    queryFn: () => getAnalyticsOverview({ range: "7d" }),
    ...PAGE_LIVE_QUERY,
    retry: false,
  });
  const best = query.data ? pickBestPost(query.data) : null;
  const health = useAccountHealth({ enabled: canPublish && !!best });
  const share = useShareElsewhere();

  // One working account per network the post hasn't reached yet.
  const targets = useMemo(() => {
    if (!best) return [];
    const done = new Set(best.platforms);
    const byNetwork = new Map<string, string>();
    for (const a of health.accounts) {
      if (a.health !== "healthy" || done.has(a.platform) || byNetwork.has(a.platform)) continue;
      byNetwork.set(a.platform, a.id);
    }
    return [...byNetwork.entries()].map(([network, accountId]) => ({ network, accountId }));
  }, [best, health.accounts]);

  if (!best) return null;
  const networks = targets.map((t) => t.network);
  // Only suggest more networks for a post that clearly stood out: well above
  // the person's own average, or real reach on its own.
  const didWell =
    (best.multiple ?? 0) >= 1.5 || best.value >= (best.metric === "views" ? 1000 : 50);

  const where = best.platforms.length === 1 ? ` on ${networkLabel(best.platforms[0])}` : "";
  return (
    <section
      aria-label="Best post this week"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg-elevated p-4 sm:flex-nowrap"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-muted">Best post this week</p>
        <Link
          href={dash(`posts/${best.postId}`)}
          className="block truncate text-sm font-semibold text-text hover:underline"
        >
          {postTitle(best.snippet === "(No caption)" ? "" : best.snippet)}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1">
            {best.platforms.slice(0, 4).map((p) => (
              <NetworkIcon key={p} network={p} size={12} />
            ))}
          </span>
          <span>
            {compact.format(best.value)}{" "}
            {best.value === 1 ? (best.metric === "views" ? "view" : "engagement") : best.metric}
            {where}
            {best.multiple ? ` · ${best.multiple.toFixed(1)}× your average` : ""}
          </span>
        </p>
      </div>
      {canPublish && didWell && targets.length > 0 ? (
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            disabled={share.busy}
            onClick={() => void share.run(best.postId, targets.map((t) => t.accountId))}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 text-sm font-medium text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1" aria-hidden>
              {networks.slice(0, 3).map((n) => (
                <NetworkIcon key={n} network={n} size={14} />
              ))}
            </span>
            {share.busy
              ? "Opening…"
              : networks.length <= 2
                ? `Share on ${joinNetworks(networks)}`
                : `Share on ${networks.length} more networks`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
