/**
 * Analytics orchestrator - live fetch for overview + per-post.
 * Caps concurrency to stay polite with platform APIs.
 * May persist a resolved TikTok public video id onto post_publications.
 */

import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { addDays, format, startOfDay } from "date-fns";
import { db } from "../db/index.js";
import {
  connectedAccounts,
  postPublications,
  posts,
} from "../db/schema.js";
import { postScopeCondition } from "../lib/workspace/context.js";
import { requireWorkspaceSession } from "../lib/workspace/session.js";
import { rpcHttpError } from "../lib/rpc-http-error.js";
import { resolveAccountAccess } from "../lib/account-access.js";
import { listActiveConnectedAccounts } from "../lib/connected-accounts.js";
import { mapPool } from "../lib/map-pool.js";
import { fetchPlatformPublicationMetrics } from "../lib/analytics/fetch-platform-metrics.js";
import { isPlatformLive, livePlatformIds } from "../lib/live-platforms.js";
import { parseDateWindow } from "../lib/date-window.js";
import {
  engagementTotal,
  missingAnalyticsScopes,
  sumMetrics,
  type AnalyticsOverview,
  type AnalyticsSeriesPoint,
  type MetricMap,
  type PlatformBreakdownRow,
  type PostAnalyticsResult,
  type PublicationMetrics,
  type TopPostRow,
  type AccountReconnectHint,
} from "../lib/analytics/types.js";

const SAMPLE_LIMIT = 48;
const CONCURRENCY = 6;

type PubRow = {
  publicationId: string;
  postId: string;
  platformPostId: string | null;
  platformPostUrl: string | null;
  publishedAt: Date | null;
  connectedAccountId: string | null;
  content: string | null;
  account: {
    id: string;
    platform: string;
    platformUserId: string;
    platformUsername: string | null;
    scopes: string | null;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
    platformAccountType: string | null;
  } | null;
};

async function loadPublishedPubs(opts: {
  resourceUserId: string;
  workspaceId: string | null;
  since: Date;
  until: Date;
  postId?: string;
  accountId?: string;
  limit?: number;
}): Promise<PubRow[]> {
  const live = livePlatformIds("analytics");
  if (!live.length) return [];
  const postFilter = postScopeCondition({
    resourceUserId: opts.resourceUserId,
    workspaceId: opts.workspaceId,
  });

  const rows = await db
    .select({
      publicationId: postPublications.id,
      postId: posts.id,
      platformPostId: postPublications.platformPostId,
      platformPostUrl: postPublications.platformPostUrl,
      publishedAt: postPublications.publishedAt,
      connectedAccountId: postPublications.connectedAccountId,
      content: posts.finalContent,
      accountId: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
      platformUsername: connectedAccounts.platformUsername,
      scopes: connectedAccounts.scopes,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
      platformAccountType: connectedAccounts.platformAccountType,
    })
    .from(postPublications)
    .innerJoin(posts, eq(postPublications.postId, posts.id))
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        postFilter,
        eq(postPublications.status, "published"),
        inArray(connectedAccounts.platform, live),
        opts.postId ? eq(posts.id, opts.postId) : undefined,
        opts.accountId
          ? eq(postPublications.connectedAccountId, opts.accountId)
          : undefined,
        opts.postId
          ? undefined
          : and(
              isNotNull(postPublications.publishedAt),
              isNotNull(postPublications.platformPostId),
              gte(postPublications.publishedAt, opts.since),
              lte(postPublications.publishedAt, opts.until),
            ),
      ),
    )
    .orderBy(desc(postPublications.publishedAt))
    .limit(opts.limit ?? SAMPLE_LIMIT);

  return rows.map((r) => ({
    publicationId: r.publicationId,
    postId: r.postId,
    platformPostId: r.platformPostId,
    platformPostUrl: r.platformPostUrl,
    publishedAt: r.publishedAt,
    connectedAccountId: r.connectedAccountId,
    content: r.content,
    account: r.accountId
      ? {
          id: r.accountId,
          platform: r.platform!,
          platformUserId: r.platformUserId!,
          platformUsername: r.platformUsername,
          scopes: r.scopes,
          encryptedAccessToken: r.encryptedAccessToken!,
          encryptedRefreshToken: r.encryptedRefreshToken,
          platformAccountType: r.platformAccountType,
        }
      : null,
  }));
}

async function metricsForPub(row: PubRow): Promise<PublicationMetrics> {
  const base: PublicationMetrics = {
    publicationId: row.publicationId,
    postId: row.postId,
    platform: row.account?.platform ?? "unknown",
    accountId: row.account?.id ?? row.connectedAccountId,
    accountLabel: row.account?.platformUsername ?? null,
    platformPostId: row.platformPostId,
    platformPostUrl: row.platformPostUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    metrics: {},
    status: "ok",
  };

  if (!row.platformPostId) {
    return { ...base, status: "no_platform_id", error: "Missing platform post id." };
  }
  if (!row.account) {
    return {
      ...base,
      status: "error",
      error: "Connected account was removed.",
    };
  }

  const missing = missingAnalyticsScopes(row.account.platform, row.account.scopes);

  try {
    const { accessToken, accessSecret } = await resolveAccountAccess(row.account);
    const result = await fetchPlatformPublicationMetrics({
      platform: row.account.platform,
      platformPostId: row.platformPostId,
      platformUserId: row.account.platformUserId,
      accessToken,
      accessSecret,
      scopes: row.account.scopes,
      platformAccountType: row.account.platformAccountType,
    });

    if (
      result.resolvedPlatformPostId &&
      result.resolvedPlatformPostId !== row.platformPostId
    ) {
      await db
        .update(postPublications)
        .set({
          platformPostId: result.resolvedPlatformPostId,
          updatedAt: new Date(),
        })
        .where(eq(postPublications.id, row.publicationId));
      row.platformPostId = result.resolvedPlatformPostId;
    }

    const missingScopes = result.missingScopes?.length
      ? result.missingScopes
      : missing.length && result.status === "scope_missing"
        ? missing
        : result.missingScopes;

    return {
      ...base,
      platformPostId: row.platformPostId,
      metrics: result.metrics,
      status: result.status,
      error: result.error,
      missingScopes,
    };
  } catch (e) {
    return {
      ...base,
      status: "error",
      error: e instanceof Error ? e.message : "Metrics fetch failed",
      missingScopes: missing.length ? missing : undefined,
    };
  }
}

function collectReconnectHints(
  pubs: PublicationMetrics[],
): AccountReconnectHint[] {
  const byId = new Map<string, AccountReconnectHint>();
  for (const p of pubs) {
    if (!p.accountId || !p.missingScopes?.length) continue;
    const existing = byId.get(p.accountId);
    if (existing) {
      const set = new Set([...existing.missingScopes, ...p.missingScopes]);
      existing.missingScopes = [...set];
    } else {
      byId.set(p.accountId, {
        accountId: p.accountId,
        platform: p.platform,
        username: p.accountLabel,
        missingScopes: [...p.missingScopes],
      });
    }
  }
  return [...byId.values()];
}

function buildSeries(
  pubs: PublicationMetrics[],
  since: Date,
  until: Date,
): AnalyticsSeriesPoint[] {
  const byDay = new Map<string, AnalyticsSeriesPoint>();
  for (const p of pubs) {
    if (p.status !== "ok" && Object.keys(p.metrics).length === 0) continue;
    const day = p.publishedAt
      ? format(new Date(p.publishedAt), "yyyy-MM-dd")
      : null;
    if (!day) continue;
    const cur = byDay.get(day) ?? {
      date: day,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      engagement: 0,
    };
    cur.views += p.metrics.views ?? p.metrics.impressions ?? 0;
    cur.likes += p.metrics.likes ?? 0;
    cur.comments += p.metrics.comments ?? 0;
    cur.shares +=
      (p.metrics.shares ?? 0) + (p.metrics.reposts ?? 0) + (p.metrics.quotes ?? 0);
    cur.engagement += engagementTotal(p.metrics);
    byDay.set(day, cur);
  }
  // ponytail: fill every day in range so the chart spans the selected window (X Analytics-style).
  const out: AnalyticsSeriesPoint[] = [];
  const last = startOfDay(until);
  for (let d = startOfDay(since); d <= last; d = addDays(d, 1)) {
    const key = format(d, "yyyy-MM-dd");
    out.push(
      byDay.get(key) ?? {
        date: key,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        engagement: 0,
      },
    );
  }
  return out;
}

function buildByPlatform(pubs: PublicationMetrics[]): PlatformBreakdownRow[] {
  const map = new Map<string, { metrics: MetricMap[]; postIds: Set<string> }>();
  for (const p of pubs) {
    if (p.status !== "ok") continue;
    if (!map.has(p.platform)) {
      map.set(p.platform, { metrics: [], postIds: new Set() });
    }
    const row = map.get(p.platform)!;
    row.metrics.push(p.metrics);
    row.postIds.add(p.postId);
  }
  return [...map.entries()]
    .map(([platform, v]) => ({
      platform,
      postCount: v.postIds.size,
      metrics: sumMetrics(v.metrics),
    }))
    .sort(
      (a, b) =>
        engagementTotal(b.metrics) + (b.metrics.views ?? 0) -
        (engagementTotal(a.metrics) + (a.metrics.views ?? 0)),
    );
}

function buildTopPosts(
  pubs: PublicationMetrics[],
  contentByPost: Map<string, string | null>,
): TopPostRow[] {
  const byPost = new Map<
    string,
    { metrics: MetricMap[]; platforms: Set<string>; publishedAt: string | null }
  >();
  for (const p of pubs) {
    if (p.status !== "ok") continue;
    const cur = byPost.get(p.postId) ?? {
      metrics: [],
      platforms: new Set<string>(),
      publishedAt: p.publishedAt,
    };
    cur.metrics.push(p.metrics);
    cur.platforms.add(p.platform);
    if (
      p.publishedAt &&
      (!cur.publishedAt || p.publishedAt > cur.publishedAt)
    ) {
      cur.publishedAt = p.publishedAt;
    }
    byPost.set(p.postId, cur);
  }
  return [...byPost.entries()]
    .map(([postId, v]) => {
      const metrics = sumMetrics(v.metrics);
      const raw = contentByPost.get(postId) ?? "";
      const snippet =
        raw.replace(/\s+/g, " ").trim().slice(0, 120) || "(No caption)";
      return {
        postId,
        snippet,
        publishedAt: v.publishedAt,
        metrics,
        platforms: [...v.platforms],
      };
    })
    .sort(
      (a, b) =>
        engagementTotal(b.metrics) + (b.metrics.views ?? 0) -
        (engagementTotal(a.metrics) + (a.metrics.views ?? 0)),
    )
    .slice(0, 10);
}

export async function getAnalyticsOverview(input: {
  range?: unknown;
  since?: unknown;
  until?: unknown;
  accountId?: unknown;
}): Promise<AnalyticsOverview> {
  const ws = await requireWorkspaceSession("view_analytics");
  if (!ws.ok) throw rpcHttpError(ws.error, ws.statusCode);

  const window = parseDateWindow(input);
  const { range, since, until } = window;

  const ctx = ws.ctx;
  const accountId =
    typeof input.accountId === "string" && input.accountId
      ? input.accountId
      : undefined;
  if (accountId) {
    const accounts = await listActiveConnectedAccounts(ctx);
    if (!accounts.some((a) => a.id === accountId)) {
      throw rpcHttpError("Account not found", 404);
    }
  }
  const pubs = await loadPublishedPubs({
    resourceUserId: ctx.resourceUserId,
    workspaceId: ctx.workspaceId,
    since,
    until,
    accountId,
    limit: SAMPLE_LIMIT,
  });

  const results = await mapPool(pubs, CONCURRENCY, metricsForPub);
  const contentByPost = new Map(
    pubs.map((p) => [p.postId, p.content] as const),
  );
  const okResults = results.filter((r) => r.status === "ok");

  const accountRows = await listActiveConnectedAccounts(ctx);
  const fromAccounts: AccountReconnectHint[] = accountRows
    .filter((r) => isPlatformLive("analytics", r.platform))
    .map((r) => ({
      accountId: r.id,
      platform: r.platform,
      username: r.username,
      missingScopes: missingAnalyticsScopes(r.platform, r.scopes),
    }))
    .filter((a) => a.missingScopes.length > 0);

  return {
    range,
    since: since.toISOString(),
    until: until.toISOString(),
    totals: sumMetrics(okResults.map((r) => r.metrics)),
    byPlatform: buildByPlatform(results),
    series: buildSeries(okResults, since, until),
    topPosts: buildTopPosts(okResults, contentByPost),
    publications: results,
    accountsNeedingReconnect: mergeReconnectHints(
      fromAccounts,
      collectReconnectHints(results),
    ),
    fetchedAt: new Date().toISOString(),
    sampled: pubs.length >= SAMPLE_LIMIT,
    sampleLimit: SAMPLE_LIMIT,
  };
}

export async function getPostAnalytics(input: {
  postId?: unknown;
} | string): Promise<PostAnalyticsResult> {
  const ws = await requireWorkspaceSession("view_analytics");
  if (!ws.ok) throw rpcHttpError(ws.error, ws.statusCode);
  const postId =
    typeof input === "string"
      ? input
      : typeof input?.postId === "string"
        ? input.postId
        : "";
  if (!postId) {
    throw rpcHttpError("postId required", 400);
  }

  const ctx = ws.ctx;
  const until = new Date();
  const since = new Date(0);
  const pubs = await loadPublishedPubs({
    resourceUserId: ctx.resourceUserId,
    workspaceId: ctx.workspaceId,
    since,
    until,
    postId,
    limit: 50,
  });

  if (pubs.length === 0) {
    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, postId), postScopeCondition(ctx)),
      columns: { id: true },
    });
    if (!post) throw rpcHttpError("Post not found", 404);
  }

  const results = await mapPool(pubs, CONCURRENCY, metricsForPub);
  const okResults = results.filter((r) => r.status === "ok");
  return {
    postId,
    publications: results,
    totals: sumMetrics(okResults.map((r) => r.metrics)),
    accountsNeedingReconnect: collectReconnectHints(results),
    fetchedAt: new Date().toISOString(),
  };
}

function mergeReconnectHints(
  ...lists: AccountReconnectHint[][]
): AccountReconnectHint[] {
  const byId = new Map<string, AccountReconnectHint>();
  for (const list of lists) {
    for (const h of list) {
      const existing = byId.get(h.accountId);
      if (existing) {
        existing.missingScopes = [
          ...new Set([...existing.missingScopes, ...h.missingScopes]),
        ];
      } else {
        byId.set(h.accountId, { ...h, missingScopes: [...h.missingScopes] });
      }
    }
  }
  return [...byId.values()];
}

/** Connected accounts list for analytics filter chips. */
export async function listAnalyticsAccounts(): Promise<
  Array<{
    id: string;
    platform: string;
    username: string | null;
    profileImageUrl: string | null;
    missingScopes: string[];
  }>
> {
  const ws = await requireWorkspaceSession("view_analytics");
  if (!ws.ok) throw rpcHttpError(ws.error, ws.statusCode);

  const ctx = ws.ctx;
  const rows = await listActiveConnectedAccounts(ctx);

  return rows
    .filter((r) => isPlatformLive("analytics", r.platform))
    .map((r) => ({
      id: r.id,
      platform: r.platform,
      username: r.username,
      profileImageUrl: r.profileImageUrl,
      missingScopes: missingAnalyticsScopes(r.platform, r.scopes),
    }));
}
