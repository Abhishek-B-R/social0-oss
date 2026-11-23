import type { AnalyticsOverview, MetricMap } from "@/api/analytics";

function engagement(m: MetricMap): number {
  return (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.reposts ?? 0) + (m.saves ?? 0) + (m.quotes ?? 0);
}

export type BestPost = {
  postId: string;
  snippet: string;
  platforms: string[];
  metric: "views" | "engagements";
  value: number;
  /** value / average of the other posts; null when there's nothing to compare. */
  multiple: number | null;
};

/**
 * Pick this week's best post from the live overview. Views when the networks
 * report them, else engagements. Needs at least one post with a non-zero
 * score; the "× your average" line needs at least three posts.
 */
export function pickBestPost(overview: AnalyticsOverview): BestPost | null {
  const top = overview.topPosts;
  if (!top.length) return null;
  const useViews = top.some((p) => (p.metrics.views ?? 0) > 0);
  const score = (m: MetricMap) => (useViews ? (m.views ?? 0) : engagement(m));
  const ranked = [...top].sort((a, b) => score(b.metrics) - score(a.metrics));
  const best = ranked[0];
  const value = score(best.metrics);
  if (value <= 0) return null;

  // Average over every post with data this week (topPosts is capped at 10,
  // so rebuild per-post totals from the publications).
  const perPost = new Map<string, number>();
  for (const pub of overview.publications) {
    if (pub.status !== "ok") continue;
    perPost.set(pub.postId, (perPost.get(pub.postId) ?? 0) + score(pub.metrics));
  }
  const others = [...perPost.entries()].filter(([id]) => id !== best.postId).map(([, v]) => v);
  const avg = others.length >= 2 ? others.reduce((a, b) => a + b, 0) / others.length : 0;
  const multiple = avg > 0 ? value / avg : null;

  return {
    postId: best.postId,
    snippet: best.snippet,
    platforms: best.platforms,
    metric: useViews ? "views" : "engagements",
    value,
    multiple: multiple != null && multiple >= 1.2 ? multiple : null,
  };
}
