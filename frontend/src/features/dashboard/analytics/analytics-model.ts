/**
 * Pure derivations for the Analytics page (KPI tabs, previous-period deltas,
 * highlights, breakdowns). Everything is computed from the overview payload
 * the server already returned: no extra platform calls.
 *
 * Coverage caveats stay separate on purpose (see backend
 * `lib/analytics/coverage.ts`): `sampled` = the publication list was capped,
 * `partial` = the live request budget ran out. Never fold one into the other.
 */

import { formatInTimeZone } from "date-fns-tz";
import type { AnalyticsOverview, MetricMap, PublicationMetrics } from "@/api/analytics";
import type { DateWindow, WindowPreset } from "@/lib/date-window";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { engagementOf, formatMetric, viewsOf } from "./analytics-utils";

// ---------------------------------------------------------------------------
// Range

/** Preset chips shown on the page. Other presets (14d) still parse from the URL. */
export const RANGE_CHIPS: ReadonlyArray<{ value: WindowPreset; label: string }> = [
  { value: "7d", label: "7D" },
  { value: "28d", label: "28D" },
  { value: "90d", label: "3M" },
  { value: "365d", label: "1Y" },
];

export const DEFAULT_RANGE: WindowPreset = "28d";

const PRESET_PERIOD_WORDS: Record<WindowPreset, string> = {
  "7d": "previous 7 days",
  "14d": "previous 2 weeks",
  "28d": "previous 28 days",
  "90d": "previous 3 months",
  "365d": "previous year",
};

const PRESET_RANGE_WORDS: Record<WindowPreset, string> = {
  "7d": "the last 7 days",
  "14d": "the last 2 weeks",
  "28d": "the last 28 days",
  "90d": "the last 3 months",
  "365d": "the last year",
};

export function previousPeriodWords(window: DateWindow): string {
  if (window.range === "custom") return "previous period";
  return PRESET_PERIOD_WORDS[window.range];
}

export function rangeWords(window: DateWindow): string {
  if (window.range === "custom") return "this range";
  return PRESET_RANGE_WORDS[window.range];
}

/**
 * The window right before the resolved one, with the same elapsed length,
 * so "vs previous" compares like with like even while today is still running.
 */
export function previousWindow(
  since: string,
  until: string,
): { since: string; until: string } | null {
  const s = new Date(since).getTime();
  const u = new Date(until).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(u) || u <= s) return null;
  const span = u - s;
  return {
    since: new Date(s - span - 1).toISOString(),
    until: new Date(s - 1).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Metrics

export type MetricKey =
  | "views"
  | "engagement"
  | "likes"
  | "comments"
  | "shares"
  | "posts";

export const METRICS: ReadonlyArray<{
  key: MetricKey;
  label: string;
  /** Lower-case noun for sentences ("61.2K views"). */
  noun: string;
}> = [
  { key: "views", label: "Views", noun: "views" },
  { key: "engagement", label: "Engagements", noun: "engagements" },
  { key: "likes", label: "Likes", noun: "likes" },
  { key: "comments", label: "Comments", noun: "comments" },
  { key: "shares", label: "Shares", noun: "shares" },
  { key: "posts", label: "Posts", noun: "posts" },
];

export function metricMeta(key: MetricKey) {
  return METRICS.find((m) => m.key === key) ?? METRICS[0]!;
}

export function isMetricKey(v: string | null | undefined): v is MetricKey {
  return METRICS.some((m) => m.key === v);
}

/** Shares as the series counts them: shares + reposts + quotes. */
export function sharesOf(m: MetricMap): number {
  return (m.shares ?? 0) + (m.reposts ?? 0) + (m.quotes ?? 0);
}

/** One metric off a MetricMap. `undefined` = the networks didn't report it. */
export function metricValue(m: MetricMap, key: Exclude<MetricKey, "posts">): number | undefined {
  switch (key) {
    case "views":
      return viewsOf(m);
    case "engagement":
      return engagementOf(m);
    case "likes":
      return m.likes ?? 0;
    case "comments":
      return m.comments ?? 0;
    case "shares":
      return sharesOf(m);
  }
}

function dayKey(iso: string, timeZone: string): string | null {
  try {
    return formatInTimeZone(iso, timeZone, "yyyy-MM-dd");
  } catch {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
}

/** Distinct posts published in the window (every publication, any metric status). */
export function postIdsOf(pubs: PublicationMetrics[]): Set<string> {
  return new Set(pubs.map((p) => p.postId));
}

/** Per-day series for every metric, including posts published that day. */
export type SeriesRow = {
  date: string;
  views: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  posts: number;
};

export function buildSeriesRows(
  overview: AnalyticsOverview,
  timeZone: string,
): SeriesRow[] {
  // A post counts once, on the day its first publication went out.
  const firstDay = new Map<string, string>();
  for (const p of overview.publications) {
    if (!p.publishedAt) continue;
    const key = dayKey(p.publishedAt, timeZone);
    if (!key) continue;
    const cur = firstDay.get(p.postId);
    if (!cur || key < cur) firstDay.set(p.postId, key);
  }
  const postsPerDay = new Map<string, number>();
  for (const day of firstDay.values()) {
    postsPerDay.set(day, (postsPerDay.get(day) ?? 0) + 1);
  }
  return overview.series.map((s) => ({
    date: s.date,
    views: s.views,
    engagement: s.engagement,
    likes: s.likes,
    comments: s.comments,
    shares: s.shares,
    posts: postsPerDay.get(s.date) ?? 0,
  }));
}

export type KpiTotals = Record<MetricKey, number | undefined>;

export function kpiTotals(overview: AnalyticsOverview): KpiTotals {
  const t = overview.totals;
  const hasOk = overview.publications.some((p) => p.status === "ok");
  return {
    views: hasOk ? viewsOf(t) : undefined,
    engagement: hasOk ? engagementOf(t) : undefined,
    likes: hasOk ? (t.likes ?? 0) : undefined,
    comments: hasOk ? (t.comments ?? 0) : undefined,
    shares: hasOk ? sharesOf(t) : undefined,
    posts: postIdsOf(overview.publications).size,
  };
}

export type Delta =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "flat"; previous: number }
  | { kind: "change"; pct: number; previous: number };

export function deltaOf(current: number | undefined, previous: number | undefined): Delta {
  if (current == null || previous == null) return { kind: "none" };
  if (previous === 0) return current > 0 ? { kind: "new" } : { kind: "none" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { kind: "flat", previous };
  return { kind: "change", pct, previous };
}

export function formatPct(pct: number): string {
  const abs = Math.abs(pct);
  if (abs >= 1000) return `${formatMetric(Math.round(abs))}%`;
  if (abs >= 10) return `${Math.round(abs)}%`;
  return `${abs.toFixed(1).replace(/\.0$/, "")}%`;
}

/** Engagement rate (engagements / views), or null without views. */
export function engagementRate(m: MetricMap): number | null {
  const v = viewsOf(m);
  if (!v || v <= 0) return null;
  return (engagementOf(m) / v) * 100;
}

export function formatRate(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  if (rate >= 10) return `${rate.toFixed(0)}%`;
  return `${rate.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Breakdown (by account / by network)

export type BreakdownRow = {
  key: string;
  platform: string;
  label: string;
  accountId: string | null;
  posts: number;
  metrics: MetricMap;
  /** Publications that answered with metrics. 0 = nothing to show yet. */
  okCount: number;
};

export function breakdownBy(
  pubs: PublicationMetrics[],
  by: "account" | "network",
): BreakdownRow[] {
  const rows = new Map<
    string,
    { row: BreakdownRow; posts: Set<string>; metrics: MetricMap[] }
  >();
  for (const p of pubs) {
    const key = by === "account" ? (p.accountId ?? `${p.platform}:?`) : p.platform;
    let entry = rows.get(key);
    if (!entry) {
      const label =
        by === "account"
          ? p.accountLabel
            ? handleOf(p.accountLabel, p.platform)
            : (PLATFORM_LABEL[p.platform] ?? p.platform)
          : (PLATFORM_LABEL[p.platform] ?? p.platform);
      entry = {
        row: {
          key,
          platform: p.platform,
          label,
          accountId: by === "account" ? p.accountId : null,
          posts: 0,
          metrics: {},
          okCount: 0,
        },
        posts: new Set(),
        metrics: [],
      };
      rows.set(key, entry);
    }
    entry.posts.add(p.postId);
    if (p.status === "ok") {
      entry.metrics.push(p.metrics);
      entry.row.okCount += 1;
    }
  }
  return [...rows.values()].map(({ row, posts, metrics }) => ({
    ...row,
    posts: posts.size,
    metrics: sumMetricMaps(metrics),
  }));
}

export function breakdownValue(row: BreakdownRow, key: MetricKey): number | undefined {
  if (key === "posts") return row.posts;
  if (row.okCount === 0) return undefined;
  return metricValue(row.metrics, key);
}

function sumMetricMaps(list: MetricMap[]): MetricMap {
  const out: MetricMap = {};
  for (const m of list) {
    for (const [k, v] of Object.entries(m) as Array<[keyof MetricMap, number | undefined]>) {
      if (v == null || !Number.isFinite(v)) continue;
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export function handleOf(username: string | null | undefined, platform: string): string {
  const name = username?.trim();
  if (!name) return PLATFORM_LABEL[platform] ?? platform;
  if (name.startsWith("@")) return name;
  // TikTok display names can contain spaces; don't prefix those.
  if (/\s/.test(name)) return name;
  return `@${name}`;
}

// ---------------------------------------------------------------------------
// Highlights

export type Highlight = {
  id: string;
  /** The one-sentence takeaway (bold). */
  headline: string;
  /** Supporting line, always ending with the sample size. */
  detail: string;
  tone: "ok" | "default";
};

type PostAgg = {
  postId: string;
  metrics: MetricMap;
  platforms: Set<string>;
  firstPublishedAt: string | null;
};

function aggregatePosts(pubs: PublicationMetrics[]): PostAgg[] {
  const map = new Map<string, { metrics: MetricMap[]; agg: PostAgg }>();
  for (const p of pubs) {
    if (p.status !== "ok") continue;
    let entry = map.get(p.postId);
    if (!entry) {
      entry = {
        metrics: [],
        agg: {
          postId: p.postId,
          metrics: {},
          platforms: new Set(),
          firstPublishedAt: p.publishedAt,
        },
      };
      map.set(p.postId, entry);
    }
    entry.metrics.push(p.metrics);
    entry.agg.platforms.add(p.platform);
    if (
      p.publishedAt &&
      (!entry.agg.firstPublishedAt || p.publishedAt < entry.agg.firstPublishedAt)
    ) {
      entry.agg.firstPublishedAt = p.publishedAt;
    }
  }
  return [...map.values()].map(({ metrics, agg }) => ({
    ...agg,
    metrics: sumMetricMaps(metrics),
  }));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function times(ratio: number): string {
  return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1).replace(/\.0$/, "")}×`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function snippetOf(text: string, max = 60): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Up to three plain sentences about the data on screen. Each one states its
 * sample size and only appears when the sample can carry it.
 */
export function buildHighlights(
  overview: AnalyticsOverview,
  timeZone: string,
): Highlight[] {
  const out: Highlight[] = [];
  const posts = aggregatePosts(overview.publications);
  const snippets = new Map(overview.topPosts.map((p) => [p.postId, p.snippet] as const));

  // 1. Standout post vs the average of the others.
  if (posts.length >= 3) {
    const withViews = posts.filter((p) => viewsOf(p.metrics) != null);
    const useViews = withViews.length >= Math.ceil(posts.length / 2) && withViews.length >= 3;
    const pool = useViews ? withViews : posts;
    const score = (p: PostAgg) =>
      useViews ? (viewsOf(p.metrics) ?? 0) : engagementOf(p.metrics);
    const sorted = [...pool].sort((a, b) => score(b) - score(a));
    const top = sorted[0]!;
    const othersAvg = mean(sorted.slice(1).map(score));
    if (othersAvg > 0 && score(top) / othersAvg >= 1.5) {
      const ratio = score(top) / othersAvg;
      const noun = useViews ? "views" : "engagements";
      const snippet = snippets.get(top.postId);
      const where = [...top.platforms]
        .map((p) => PLATFORM_LABEL[p] ?? p)
        .join(" and ");
      out.push({
        id: "standout",
        headline: `Your top post got ${times(ratio)} your average ${noun}.`,
        detail: `${snippet && snippet !== "(No caption)" ? `“${snippetOf(snippet)}”, ` : ""}${formatMetric(score(top))} ${noun} on ${where}. Based on ${plural(pool.length, "post")}.`,
        tone: "ok",
      });
    }
  }

  // 2. Best weekday by engagement per post.
  if (posts.length >= 6) {
    const byDay = new Map<number, number[]>();
    for (const p of posts) {
      if (!p.firstPublishedAt) continue;
      let idx: number;
      try {
        idx = Number(formatInTimeZone(p.firstPublishedAt, timeZone, "i")) - 1;
      } catch {
        idx = (new Date(p.firstPublishedAt).getDay() + 6) % 7;
      }
      if (!(idx >= 0 && idx < 7)) continue;
      const list = byDay.get(idx) ?? [];
      list.push(engagementOf(p.metrics));
      byDay.set(idx, list);
    }
    const buckets = [...byDay.entries()].filter(([, v]) => v.length >= 2);
    const overall = mean([...byDay.values()].flat());
    if (buckets.length >= 2 && overall > 0) {
      const [bestDay, bestValues] = buckets.sort(
        (a, b) => mean(b[1]) - mean(a[1]),
      )[0]!;
      const ratio = mean(bestValues) / overall;
      if (ratio >= 1.3) {
        const sample = [...byDay.values()].reduce((n, v) => n + v.length, 0);
        out.push({
          id: "best-day",
          headline: `Best day to post: ${WEEKDAYS[bestDay]}.`,
          detail: `Posts published then got ${times(ratio)} your average engagement. Based on ${plural(sample, "post")}.`,
          tone: "default",
        });
      }
    }
  }

  // 3. Network with the most engagement per post.
  const byNetwork = new Map<string, number[]>();
  for (const p of overview.publications) {
    if (p.status !== "ok") continue;
    const list = byNetwork.get(p.platform) ?? [];
    list.push(engagementOf(p.metrics));
    byNetwork.set(p.platform, list);
  }
  const networks = [...byNetwork.entries()].filter(([, v]) => v.length >= 2);
  if (networks.length >= 2) {
    networks.sort((a, b) => mean(b[1]) - mean(a[1]));
    const [best, bestValues] = networks[0]!;
    const others = networks.slice(1).flatMap(([, v]) => v);
    const othersAvg = mean(others);
    if (othersAvg > 0 && mean(bestValues) / othersAvg >= 1.3) {
      const sample = networks.reduce((n, [, v]) => n + v.length, 0);
      out.push({
        id: "best-network",
        headline: `${PLATFORM_LABEL[best] ?? best} gets you the most engagement per post.`,
        detail: `${times(mean(bestValues) / othersAvg)} your other networks. Based on ${plural(sample, "post")}.`,
        tone: "default",
      });
    }
  }

  return out.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Coverage

/** Publications skipped because the live budget ran out (the `partial` caveat). */
export function skippedCount(overview: AnalyticsOverview): number {
  return overview.publications.filter((p) => p.status === "skipped").length;
}
