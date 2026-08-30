import { rpc } from "@/lib/rpc";
import type { DateWindowRange } from "@/lib/date-window";

export type AnalyticsRange = DateWindowRange;

export type MetricMap = Partial<
  Record<
    | "views"
    | "likes"
    | "comments"
    | "shares"
    | "reposts"
    | "saves"
    | "reach"
    | "impressions"
    | "clicks"
    | "quotes",
    number
  >
>;

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
  status:
    | "ok"
    | "scope_missing"
    | "unsupported"
    | "error"
    | "no_platform_id"
    | "skipped";
  error?: string;
  missingScopes?: string[];
};

export type AnalyticsOverview = {
  range: AnalyticsRange;
  since: string;
  until: string;
  totals: MetricMap;
  byPlatform: Array<{
    platform: string;
    postCount: number;
    metrics: MetricMap;
  }>;
  series: Array<{
    date: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagement: number;
  }>;
  topPosts: Array<{
    postId: string;
    snippet: string;
    publishedAt: string | null;
    metrics: MetricMap;
    platforms: string[];
  }>;
  publications: PublicationMetrics[];
  accountsNeedingReconnect: Array<{
    accountId: string;
    platform: string;
    username: string | null;
    missingScopes: string[];
  }>;
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
  accountsNeedingReconnect: Array<{
    accountId: string;
    platform: string;
    username: string | null;
    missingScopes: string[];
  }>;
  fetchedAt: string;
  partial?: boolean;
};

export type AnalyticsAccount = {
  id: string;
  platform: string;
  username: string | null;
  profileImageUrl: string | null;
  missingScopes: string[];
};

export function getAnalyticsOverview(input: {
  range: AnalyticsRange;
  since?: string;
  until?: string;
  accountId?: string | null;
  fresh?: boolean;
}): Promise<AnalyticsOverview> {
  return rpc<AnalyticsOverview>("analytics.getOverview", input);
}

export function getPostAnalytics(postId: string): Promise<PostAnalyticsResult> {
  return rpc<PostAnalyticsResult>("analytics.getPostAnalytics", { postId });
}

export function listAnalyticsAccounts(): Promise<AnalyticsAccount[]> {
  return rpc<AnalyticsAccount[]>("analytics.listAccounts");
}
