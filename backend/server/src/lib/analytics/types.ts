/** Live social analytics types (no DB persistence). */

import type { DateWindowRange } from "../date-window.js";

export type AnalyticsRange = DateWindowRange;

export type MetricKey =
  | "views"
  | "likes"
  | "comments"
  | "shares"
  | "reposts"
  | "saves"
  | "reach"
  | "impressions"
  | "clicks"
  | "quotes";

export type MetricMap = Partial<Record<MetricKey, number>>;

export type FetchStatus =
  | "ok"
  | "scope_missing"
  | "unsupported"
  | "error"
  | "no_platform_id"
  | "skipped";

export type PublicationMetrics = {
  publicationId: string;
  postId: string;
  platform: string;
  accountId: string | null;
  accountLabel: string | null;
  platformPostId: string | null;
  platformPostUrl: string | null;
  publishedAt: string | null;
  metrics: MetricMap;
  status: FetchStatus;
  error?: string;
  missingScopes?: string[];
};

export type AccountReconnectHint = {
  accountId: string;
  platform: string;
  username: string | null;
  missingScopes: string[];
};

export type AnalyticsSeriesPoint = {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
};

export type PlatformBreakdownRow = {
  platform: string;
  postCount: number;
  metrics: MetricMap;
};

export type TopPostRow = {
  postId: string;
  snippet: string;
  publishedAt: string | null;
  metrics: MetricMap;
  platforms: string[];
};

export type AnalyticsOverview = {
  range: AnalyticsRange;
  since: string;
  until: string;
  totals: MetricMap;
  byPlatform: PlatformBreakdownRow[];
  series: AnalyticsSeriesPoint[];
  topPosts: TopPostRow[];
  publications: PublicationMetrics[];
  accountsNeedingReconnect: AccountReconnectHint[];
  fetchedAt: string;
  sampled: boolean;
  sampleLimit: number;
  /** True when the live RPC budget expired before every publication was fetched. */
  partial?: boolean;
};

export type PostAnalyticsResult = {
  postId: string;
  publications: PublicationMetrics[];
  totals: MetricMap;
  accountsNeedingReconnect: AccountReconnectHint[];
  fetchedAt: string;
  partial?: boolean;
};

/**
 * Extra scopes needed for insights. Empty = current publish token is enough.
 * YouTube video stats already work with youtube.readonly — don't nag for yt-analytics.
 */
export const ANALYTICS_REQUIRED_SCOPES: Record<string, string[]> = {
  instagram: ["instagram_business_manage_insights"],
  threads: ["threads_manage_insights"],
  tiktok: ["video.list"],
  facebook: ["read_insights"],
  youtube: [],
  linkedin: [],
  pinterest: [],
  twitter_x: [],
  bluesky: [],
};

export function sumMetrics(maps: MetricMap[]): MetricMap {
  const out: MetricMap = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m) as [MetricKey, number | undefined][]) {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export function engagementTotal(m: MetricMap): number {
  return (
    (m.likes ?? 0) +
    (m.comments ?? 0) +
    (m.shares ?? 0) +
    (m.reposts ?? 0) +
    (m.quotes ?? 0) +
    (m.saves ?? 0) +
    (m.clicks ?? 0)
  );
}

/** True if granted scope string includes needed scope (comma/space separated). */
export function scopeGranted(
  granted: string | null | undefined,
  needed: string,
): boolean {
  if (!granted) return false;
  const parts = granted.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return parts.some((p) => {
    if (p === needed) return true;
    if (needed.startsWith("https://") && p.endsWith(needed)) return true;
    return false;
  });
}

export function missingAnalyticsScopes(
  platform: string,
  granted: string | null | undefined,
): string[] {
  const needed = ANALYTICS_REQUIRED_SCOPES[platform] ?? [];
  if (needed.length === 0) return [];
  // Unknown stored scopes — live fetch decides reconnect (avoid stale nag).
  if (!granted?.trim()) return [];
  return needed.filter((s) => !scopeGranted(granted, s));
}
