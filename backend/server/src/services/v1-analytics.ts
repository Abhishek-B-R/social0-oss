/**
 * `/v1` analytics for API keys (CLI / MCP).
 *
 * Reuses the dashboard analytics core with the caller's scope: the personal pool,
 * or a team workspace named by `workspace_id` (lib/v1-workspace.ts). Responses
 * are snake_case to match the rest of `/v1`.
 */

import type { V1Scope } from "../lib/v1-workspace.js";
import {
  analyticsAccountsForScope,
  analyticsOverviewForScope,
  postAnalyticsForScope,
  type AnalyticsScope,
} from "./analytics.js";
import {
  engagementTotal,
  type MetricMap,
  type PublicationMetrics,
} from "../lib/analytics/types.js";

const TOP_POSTS_LIMIT = 10;

function scopeFor(scope: V1Scope): AnalyticsScope {
  return { resourceUserId: scope.userId, workspaceId: scope.workspaceId };
}

export type V1AnalyticsQuery = {
  range?: string;
  since?: string;
  until?: string;
  account_id?: string;
  fresh?: boolean;
};

function metrics(m: MetricMap) {
  return {
    views: m.views ?? null,
    impressions: m.impressions ?? null,
    reach: m.reach ?? null,
    likes: m.likes ?? null,
    comments: m.comments ?? null,
    shares: m.shares ?? null,
    reposts: m.reposts ?? null,
    quotes: m.quotes ?? null,
    saves: m.saves ?? null,
    clicks: m.clicks ?? null,
    engagement: engagementTotal(m),
  };
}

function publication(p: PublicationMetrics) {
  return {
    publication_id: p.publicationId,
    post_id: p.postId,
    platform: p.platform,
    account_id: p.accountId,
    account_username: p.accountLabel,
    platform_post_id: p.platformPostId,
    platform_post_url: p.platformPostUrl,
    published_at: p.publishedAt,
    status: p.status,
    error: p.error ?? null,
    missing_scopes: p.missingScopes ?? [],
    metrics: metrics(p.metrics),
  };
}

function reconnect(
  hints: Array<{
    accountId: string;
    platform: string;
    username: string | null;
    missingScopes: string[];
  }>,
) {
  return hints.map((h) => ({
    account_id: h.accountId,
    platform: h.platform,
    username: h.username,
    missing_scopes: h.missingScopes,
  }));
}

export async function v1AnalyticsOverview(
  scope: V1Scope,
  query: V1AnalyticsQuery,
) {
  const data = await analyticsOverviewForScope(scopeFor(scope), {
    range: query.range,
    since: query.since,
    until: query.until,
    accountId: query.account_id,
    fresh: query.fresh,
  });

  return {
    range: data.range,
    since: data.since,
    until: data.until,
    fetched_at: data.fetchedAt,
    // `sampled`/`partial` are not cosmetic: totals below cover only the
    // publications we actually read, so scripts must be able to detect it.
    sampled: data.sampled,
    sample_limit: data.sampleLimit,
    partial: data.partial ?? false,
    totals: metrics(data.totals),
    by_platform: data.byPlatform.map((row) => ({
      platform: row.platform,
      post_count: row.postCount,
      metrics: metrics(row.metrics),
    })),
    series: data.series.map((point) => ({
      date: point.date,
      views: point.views,
      likes: point.likes,
      comments: point.comments,
      shares: point.shares,
      engagement: point.engagement,
    })),
    // The core returns every sampled post (the dashboard re-ranks them by the
    // picked metric); the public contract stays the top 10.
    top_posts: data.topPosts.slice(0, TOP_POSTS_LIMIT).map((post) => ({
      post_id: post.postId,
      snippet: post.snippet,
      published_at: post.publishedAt,
      platforms: post.platforms,
      metrics: metrics(post.metrics),
    })),
    publications: data.publications.map(publication),
    accounts_needing_reconnect: reconnect(data.accountsNeedingReconnect),
  };
}

export async function v1PostAnalytics(scope: V1Scope, postId: string) {
  const data = await postAnalyticsForScope(scopeFor(scope), { postId });
  return {
    post_id: data.postId,
    fetched_at: data.fetchedAt,
    partial: data.partial ?? false,
    totals: metrics(data.totals),
    publications: data.publications.map(publication),
    accounts_needing_reconnect: reconnect(data.accountsNeedingReconnect),
  };
}

export async function v1ListAnalyticsAccounts(scope: V1Scope) {
  const rows = await analyticsAccountsForScope(scopeFor(scope));
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    username: r.username,
    profile_image_url: r.profileImageUrl,
    missing_scopes: r.missingScopes,
  }));
}
