import { db } from "@/db";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
  resurfaceSchedules,
  autoPlugs,
  queuedPosts,
} from "@/db/schema";
import { eq, desc, asc, inArray, and, sql, gte, exists, gt, lt, ne, isNull, ilike } from "drizzle-orm";
import { startOfWeek, startOfMonth } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { INTERRUPTED_PUBLISH_ERROR } from "@social0/shared";
import { isValidIanaTimezone } from "@/lib/resolve-scheduled-at";
import { listTotal } from "@/lib/list-total";
import { connectionScopeCondition } from "@/lib/workspace/context";
import { agentSourceCondition } from "@/lib/post-source";
import { getSubscriptionForUser } from "@/lib/subscription";
import { accountReconnectedAtSql } from "@/lib/account-reconnect";
import {
  idlePublicationSql,
  isPostPublishingStale,
  postPublishingStaleSql,
} from "@/lib/stuck-publishing";
import { PLATFORMS } from "@/lib/platforms";
import {
  settledPublishingStatus,
  settlePublishingPosts,
} from "./settle-publishing.js";
import { isActiveTier } from "@social0/shared";
import { POSTS_PAGE_SIZE } from "@social0/shared";
import type { PublicationRow, PostsListParams } from "@social0/shared";

/**
 * A publication row as the dashboard reads it: the shared row plus whether
 * the account was re-authorized after this delivery failed.
 */
export type DashboardPublicationRow = PublicationRow & {
  /**
   * True only for a failed delivery whose account was reconnected (OAuth /
   * BYOK stamp `platform_metadata.reconnectedAt`) after it failed. A dead
   * token stays a "Reconnect" until then: `token_status` alone only flips
   * when the health sweep runs, so it can't tell a fixed account apart.
   */
  reconnectedSinceFailure: boolean;
};

/** SQL for `DashboardPublicationRow.reconnectedSinceFailure`. */
const reconnectedSinceFailureSql = sql<boolean>`coalesce(${postPublications.status} = 'failed' and ${accountReconnectedAtSql} > coalesce(${postPublications.updatedAt}, ${postPublications.createdAt}), false)`;

export { POSTS_PAGE_SIZE } from "@social0/shared";
export type {
  PublicationRow,
  PostsListParams,
  StatusFilter,
} from "@social0/shared";

/** True if the user has payment-failed posts and no active subscription (so banner should show). */
export async function hasPaymentFailedPosts(
  userId: string,
  workspaceId: string | null = null,
): Promise<boolean> {
  const subscription = await getSubscriptionForUser(userId);
  if (isActiveTier(subscription.tier)) return false;

  const [row] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.userId, userId),
        workspaceId
          ? eq(posts.workspaceId, workspaceId)
          : isNull(posts.workspaceId),
        eq(posts.status, "failed"),
        sql`${posts.failureReason} LIKE '%Payment required%'`,
      ),
    )
    .limit(1);
  return !!row?.id;
}

const MAX_QUERY_LENGTH = 200;

const PLATFORM_ORDER: readonly string[] = PLATFORMS.map((p) => p.id);
const PLATFORM_NAMES = new Map<string, string>(PLATFORMS.map((p) => [p.id, p.name]));

/** Escape LIKE wildcards so a search for "50%" means the text "50%". */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Normalized caption search term, or null when blank. */
export function normalizePostsQuery(query: string | null | undefined): string | null {
  if (typeof query !== "string") return null;
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  return trimmed ? trimmed : null;
}

/**
 * A post that has said "publishing" for `STUCK_PUBLISHING_MINUTES` (from the
 * latest of created, scheduled and last-updated time) is stuck, and the SPA
 * shows it as failed with a Retry (`effectiveStatus` in posts-model.ts uses the
 * same threshold). The Failed tab and its count must include it too.
 */
const stuckPublishingSql = sql`(${posts.status} = 'publishing' and ${postPublishingStaleSql})`;
const failedOrStuckSql = sql`(${posts.status} = 'failed' or ${stuckPublishingSql})`;

/** SQL for one status filter value (undefined = no status condition). */
function statusCondition(statusFilter: PostsListParams["statusFilter"]) {
  switch (statusFilter) {
    case "draft":
    case "scheduled":
    case "published":
      return eq(posts.status, statusFilter);
    case "failed":
      return failedOrStuckSql;
    case "published_or_partial":
      return inArray(posts.status, ["published", "partial"]);
    case "needs_review":
      return and(eq(posts.status, "draft"), agentSourceCondition());
    case "user_draft":
      // `IS NOT TRUE`: rows with no metadata make the IN() null, not false.
      return and(
        eq(posts.status, "draft"),
        sql`(${agentSourceCondition()}) is not true`,
      );
    default:
      return undefined;
  }
}

/**
 * Posts list `?source=` filter. One token per chip the SPA shows, computed
 * from `posts.metadata.source` the same way `toPostSourceDto` reads it:
 *
 * - `user:<userId>`: made in the dashboard by that person. Rows from before
 *   source stamping (and any non-agent kind) count as the creator, falling
 *   back to the post owner.
 * - `mcp:<client lowercased>`: an MCP host; `mcp:` when the host is unknown.
 * - `cli:<keyName>` / `api:<keyName>`: an API key, split by `via`.
 */
export type PostsSourceFilter = string;

const MAX_SOURCE_FILTER_LENGTH = 200;

function sourceField(field: "client" | "via" | "keyName") {
  // Field names are fixed literals, never user input.
  return sql`nullif(btrim(${posts.metadata} -> 'source' ->> ${sql.raw(`'${field}'`)}), '')`;
}

/** SQL expression: the `?source=` token for each post row. */
function postSourceTokenExpr() {
  const kind = sql`(${posts.metadata} -> 'source' ->> 'kind')`;
  return sql<string>`(case
    when ${kind} = 'mcp' then 'mcp:' || coalesce(lower(${sourceField("client")}), '')
    when ${kind} = 'api_key' then
      (case when ${sourceField("via")} = 'cli' then 'cli:' else 'api:' end)
      || coalesce(${sourceField("keyName")}, 'API key')
    else 'user:' || coalesce(${posts.createdByUserId}, ${posts.userId})
  end)`;
}

function normalizeSourceFilter(source: string | null | undefined): string | null {
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  return trimmed ? trimmed.slice(0, MAX_SOURCE_FILTER_LENGTH) : null;
}

/**
 * Where the Posts "This week" / "This month" filter starts: Monday 00:00 or
 * the 1st at 00:00 on the viewer's own calendar, as a UTC instant. The API
 * process runs in UTC, so computing it in process-local time started a Los
 * Angeles user's week at Sunday 5pm and an Indian user's at Monday 5:30am.
 * An unknown or missing zone falls back to UTC.
 */
export function postsTimeFilterStart(
  time: string | null | undefined,
  timeZone: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (time !== "week" && time !== "month") return null;
  const tz = timeZone?.trim();
  const zone = tz && isValidIanaTimezone(tz) ? tz : "UTC";
  // `toZonedTime` puts the zone's wall time in the Date's local fields, which
  // is what startOfWeek / startOfMonth read; `fromZonedTime` maps it back.
  const zoned = toZonedTime(now, zone);
  const startLocal =
    time === "week"
      ? startOfWeek(zoned, { weekStartsOn: 1 })
      : startOfMonth(zoned);
  return fromZonedTime(startLocal, zone);
}

/**
 * The viewer's IANA zone for the time filter (null = UTC). Used only by
 * `time`; every other filter is zone-free.
 */
type PostsTimeZoneParam = { timeZone?: string | null };

/** Shared list WHERE — keep adjacent nav in lockstep with getPostsListData. */
function buildPostsListWhere({
  userId,
  workspaceId = null,
  statusFilter,
  platform: platformFilter,
  time: timeFilter,
  account: accountFilter,
  query,
  source,
  timeZone,
  /** When no status filter (all posts), detail nav still skips drafts. */
  excludeDrafts = false,
}: Pick<
  PostsListParams,
  | "userId"
  | "workspaceId"
  | "statusFilter"
  | "platform"
  | "time"
  | "account"
  | "query"
> &
  PostsTimeZoneParam & {
    source?: PostsSourceFilter | null;
    excludeDrafts?: boolean;
  }) {
  const search = normalizePostsQuery(query);
  const sourceToken = normalizeSourceFilter(source);
  const timeFilterDate = postsTimeFilterStart(timeFilter, timeZone);

  return and(
    eq(posts.userId, userId),
    workspaceId
      ? eq(posts.workspaceId, workspaceId)
      : isNull(posts.workspaceId),
    statusCondition(statusFilter),
    search ? ilike(posts.originalContent, likePattern(search)) : undefined,
    sourceToken ? sql`${postSourceTokenExpr()} = ${sourceToken}` : undefined,
    excludeDrafts && !statusFilter
      ? sql`${posts.status} IS DISTINCT FROM 'draft'`
      : undefined,
    timeFilterDate ? gte(posts.createdAt, timeFilterDate) : undefined,
    platformFilter
      ? exists(
          db
            .select({ v: sql`1` })
            .from(postPublications)
            .innerJoin(
              connectedAccounts,
              eq(postPublications.connectedAccountId, connectedAccounts.id),
            )
            .where(
              and(
                eq(postPublications.postId, posts.id),
                sql`${connectedAccounts.platform} = ${platformFilter}`,
              ),
            ),
        )
      : undefined,
    accountFilter
      ? exists(
          db
            .select({ v: sql`1` })
            .from(postPublications)
            .where(
              and(
                eq(postPublications.postId, posts.id),
                eq(postPublications.connectedAccountId, accountFilter),
              ),
            ),
        )
      : undefined,
  );
}

export async function getPostsListData({
  userId,
  workspaceId = null,
  statusFilter,
  sort = "newest",
  platform: platformFilter,
  time: timeFilter,
  account: accountFilter,
  query,
  source,
  timeZone,
  page = 1,
  limit = POSTS_PAGE_SIZE,
  offset: offsetParam,
}: PostsListParams &
  PostsTimeZoneParam & { source?: PostsSourceFilter | null }) {
  const offset = offsetParam ?? (page - 1) * limit;

  const whereClause = buildPostsListWhere({
    userId,
    workspaceId,
    statusFilter,
    platform: platformFilter,
    time: timeFilter,
    account: accountFilter,
    query,
    source,
    timeZone,
  });

  // Paginated SELECT first; the COUNT only runs when the page cannot answer
  // it (see listTotal).
  const userPosts = await db
    .select({
      id: posts.id,
      originalContent: posts.originalContent,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      failureReason: posts.failureReason,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      mediaIds: posts.mediaIds,
      metadata: posts.metadata,
      createdByUserId: posts.createdByUserId,
    })
    .from(posts)
    .where(whereClause)
    .orderBy(sort === "oldest" ? asc(posts.createdAt) : desc(posts.createdAt))
    .limit(limit)
    .offset(offset);

  const totalCount = await listTotal(offset, limit, userPosts.length, async () => {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(whereClause);
    return countRow?.count ?? 0;
  });
  const postIds = userPosts.map((p) => p.id);
  const publications =
    postIds.length > 0
      ? await db
          .select({
            postId: postPublications.postId,
            publicationId: postPublications.id,
            connectedAccountId: postPublications.connectedAccountId,
            status: postPublications.status,
            platformPostUrl: postPublications.platformPostUrl,
            platformPostId: postPublications.platformPostId,
            platform: connectedAccounts.platform,
            lastError: postPublications.lastError,
            profileImageUrl: connectedAccounts.profileImageUrl,
            platformUsername: connectedAccounts.platformUsername,
            platformUserId: connectedAccounts.platformUserId,
            isTwitterPremium: connectedAccounts.isTwitterPremium,
            publishedAt: postPublications.publishedAt,
            tokenStatus: connectedAccounts.tokenStatus,
            reconnectedSinceFailure: reconnectedSinceFailureSql,
          })
          .from(postPublications)
          .innerJoin(
            connectedAccounts,
            eq(postPublications.connectedAccountId, connectedAccounts.id),
          )
          .where(inArray(postPublications.postId, postIds))
      : [];

  const publicationsByPostId = publications.reduce(
    (acc, p) => {
      if (!acc[p.postId]) acc[p.postId] = [];
      acc[p.postId].push(p);
      return acc;
    },
    {} as Record<string, DashboardPublicationRow[]>,
  );

  // Settle posts left in "publishing" after every delivery finished (a
  // finalize that never ran). Only once no delivery is still pending or
  // publishing, and the UPDATE re-checks that itself.
  const settledById = new Map<string, "published" | "partial">();
  for (const p of userPosts) {
    if (p.status !== "publishing") continue;
    const settled = settledPublishingStatus(publicationsByPostId[p.id] ?? []);
    if (settled) settledById.set(p.id, settled);
  }
  const idsSettledAs = (status: "published" | "partial") =>
    [...settledById].filter(([, s]) => s === status).map(([id]) => id);
  await settlePublishingPosts(idsSettledAs("published"), "published");
  await settlePublishingPosts(idsSettledAs("partial"), "partial");

  const userPostsWithStatus = userPosts.map((p) => ({
    ...p,
    status: settledById.get(p.id) ?? p.status,
  }));

  const firstIds = userPostsWithStatus
    .map((p) => (p.mediaIds ?? [])[0])
    .filter((id): id is string => !!id);
  const firstMediaByPost = new Map<
    string,
    {
      mimeType: string;
      originalFilename: string | null;
      url: string | null;
      thumbnailUrl: string | null;
    }
  >();
  if (firstIds.length > 0) {
    const medias = await db
      .select({
        id: mediaUploads.id,
        mimeType: mediaUploads.mimeType,
        originalFilename: mediaUploads.originalFilename,
        url: mediaUploads.url,
        thumbnailUrl: mediaUploads.thumbnailUrl,
      })
      .from(mediaUploads)
      .where(
        and(
          eq(mediaUploads.userId, userId),
          inArray(mediaUploads.id, firstIds),
        ),
      );
    for (const p of userPostsWithStatus) {
      const firstId = (p.mediaIds ?? [])[0];
      if (firstId) {
        const media = medias.find((m) => m.id === firstId);
        if (media) {
          firstMediaByPost.set(p.id, {
            mimeType: media.mimeType,
            originalFilename: media.originalFilename ?? null,
            url: media.url ?? null,
            thumbnailUrl: media.thumbnailUrl ?? null,
          });
        }
      }
    }
  }

  // "All accounts" filter should include every connected account available
  // in the current workspace scope, not just accounts that appear on the
  // current page's post/publication slice.
  const connectedAccountsList = await db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUsername: connectedAccounts.platformUsername,
    })
    .from(connectedAccounts)
    .where(
      and(
        connectionScopeCondition({ resourceUserId: userId, workspaceId }),
        eq(connectedAccounts.isActive, true),
      ),
    );

  // Network filter: every network in scope (connected now, or on any post),
  // independent of paging and the active filters, so picking one network
  // doesn't shrink the menu to that network.
  const postedPlatforms = await db
    .selectDistinct({ platform: connectedAccounts.platform })
    .from(postPublications)
    .innerJoin(posts, eq(postPublications.postId, posts.id))
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        eq(posts.userId, userId),
        workspaceId
          ? eq(posts.workspaceId, workspaceId)
          : isNull(posts.workspaceId),
      ),
    );
  const platformIds = new Set([
    ...connectedAccountsList.map((a) => a.platform),
    ...postedPlatforms.map((p) => p.platform),
  ]);
  const platformOptions = [...platformIds]
    .sort((a, b) => {
      const ia = PLATFORM_ORDER.indexOf(a);
      const ib = PLATFORM_ORDER.indexOf(b);
      return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || a.localeCompare(b);
    })
    .map((id) => ({ value: id, label: PLATFORM_NAMES.get(id) ?? id }));
  const accountOptions = connectedAccountsList
    .map((a) => ({
      value: a.id,
      label: `@${a.platformUsername || a.platform} (${a.platform})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const postIdsWithXPublished = userPostsWithStatus
    .filter((p) =>
      (publicationsByPostId[p.id] ?? []).some(
        (pub) => pub.platform === "twitter_x" && pub.status === "published",
      ),
    )
    .map((p) => p.id);

  type ResurfaceMap = Record<
    string,
    {
      id: string;
      isActive: boolean;
      resurfacesDone: number;
      maxResurfaces: number;
      intervalHours: number;
      plugComment: string | null;
    }
  >;

  const resurfaceByPostId: ResurfaceMap =
    postIdsWithXPublished.length === 0
      ? {}
      : await db
          .select({
            id: resurfaceSchedules.id,
            postId: resurfaceSchedules.postId,
            isActive: resurfaceSchedules.isActive,
            resurfacesDone: resurfaceSchedules.resurfacesDone,
            maxResurfaces: resurfaceSchedules.maxResurfaces,
            intervalHours: resurfaceSchedules.intervalHours,
            plugComment: resurfaceSchedules.plugComment,
          })
          .from(resurfaceSchedules)
          .where(inArray(resurfaceSchedules.postId, postIdsWithXPublished))
          .then((schedules) => {
            const out: ResurfaceMap = {};
            for (const s of schedules) {
              out[s.postId] = {
                id: s.id,
                isActive: s.isActive ?? true,
                resurfacesDone: s.resurfacesDone ?? 0,
                maxResurfaces: s.maxResurfaces ?? 1,
                intervalHours: s.intervalHours ?? 1,
                plugComment: s.plugComment,
              };
            }
            return out;
          })
          .catch(() => ({}) as ResurfaceMap);

  const pagePostIds = userPostsWithStatus.map((p) => p.id);
  const queuedRows =
    pagePostIds.length > 0
      ? await db
          .select({ postId: queuedPosts.postId, slotId: queuedPosts.slotId })
          .from(queuedPosts)
          .where(
            and(
              eq(queuedPosts.userId, userId),
              eq(queuedPosts.status, "pending"),
              inArray(queuedPosts.postId, pagePostIds),
            ),
          )
      : [];
  const queuedPostIds = new Set(queuedRows.map((r) => r.postId));
  /** Queue slot each queued post holds (Undo of a reschedule gives it back). */
  const queuedSlotByPostId: Record<string, string> = {};
  for (const r of queuedRows) {
    if (r.slotId) queuedSlotByPostId[r.postId] = r.slotId;
  }

  return {
    userPosts: userPostsWithStatus,
    publicationsByPostId,
    firstMediaByPost,
    platformOptions,
    accountOptions,
    resurfaceByPostId,
    totalCount,
    queuedPostIds,
    queuedSlotByPostId,
  };
}

export type PostsStatusCounts = {
  all: number;
  /** Every draft, including the ones awaiting review. */
  drafts: number;
  /** Drafts created by an API key or MCP host. */
  needsReview: number;
  /** drafts - needsReview: drafts made in the dashboard. */
  userDrafts: number;
  scheduled: number;
  publishing: number;
  published: number;
  partial: number;
  failed: number;
};

/**
 * Per-status counts for the Posts tabs. Applies every list filter except
 * status, so the numbers match what each tab would show.
 */
export async function getPostsStatusCounts(
  params: Pick<
    PostsListParams,
    "userId" | "workspaceId" | "platform" | "time" | "account" | "query"
  > &
    PostsTimeZoneParam & { source?: PostsSourceFilter | null },
): Promise<PostsStatusCounts> {
  const where = buildPostsListWhere({ ...params, statusFilter: null });
  const count = (cond?: ReturnType<typeof sql>) =>
    cond
      ? sql<number>`(count(*) filter (where ${cond}))::int`
      : sql<number>`count(*)::int`;
  const [row] = await db
    .select({
      all: count(),
      drafts: count(sql`${posts.status} = 'draft'`),
      needsReview: count(
        sql`${posts.status} = 'draft' and ${agentSourceCondition()}`,
      ),
      scheduled: count(sql`${posts.status} = 'scheduled'`),
      publishing: count(sql`${posts.status} = 'publishing' and not ${stuckPublishingSql}`),
      published: count(sql`${posts.status} = 'published'`),
      partial: count(sql`${posts.status} = 'partial'`),
      failed: count(failedOrStuckSql),
    })
    .from(posts)
    .where(where);
  return {
    all: row?.all ?? 0,
    drafts: row?.drafts ?? 0,
    needsReview: row?.needsReview ?? 0,
    userDrafts: (row?.drafts ?? 0) - (row?.needsReview ?? 0),
    scheduled: row?.scheduled ?? 0,
    publishing: row?.publishing ?? 0,
    published: row?.published ?? 0,
    partial: row?.partial ?? 0,
    failed: row?.failed ?? 0,
  };
}

/** One distinct post source in scope, for the Posts "Source" filter chip. */
export type PostsSourceOptionRow = {
  /** `?source=` token (see PostsSourceFilter). */
  value: string;
  kind: "user" | "api_key" | "mcp";
  /** user: the creator. */
  userId: string | null;
  /** mcp: host name as first stored; api_key: "cli" | "api". */
  client: string | null;
  keyName: string | null;
  count: number;
};

const MAX_SOURCE_OPTIONS = 50;

/**
 * Every source that created a post in this workspace scope (ignores the other
 * list filters, like the account options), most used first.
 */
export async function getPostsSourceOptions({
  userId,
  workspaceId = null,
}: Pick<PostsListParams, "userId" | "workspaceId">): Promise<PostsSourceOptionRow[]> {
  const token = postSourceTokenExpr();
  const rows = await db
    .select({
      value: token,
      creator: sql<string>`min(coalesce(${posts.createdByUserId}, ${posts.userId}))`,
      client: sql<string | null>`min(${sourceField("client")})`,
      keyName: sql<string | null>`min(${sourceField("keyName")})`,
      count: sql<number>`count(*)::int`,
    })
    .from(posts)
    .where(
      and(
        eq(posts.userId, userId),
        workspaceId
          ? eq(posts.workspaceId, workspaceId)
          : isNull(posts.workspaceId),
      ),
    )
    .groupBy(token)
    .orderBy(sql`count(*) desc`)
    .limit(MAX_SOURCE_OPTIONS);

  return rows.map((r) => {
    if (r.value.startsWith("mcp:")) {
      return { value: r.value, kind: "mcp", userId: null, client: r.client, keyName: r.keyName, count: r.count };
    }
    if (r.value.startsWith("cli:") || r.value.startsWith("api:")) {
      return {
        value: r.value,
        kind: "api_key",
        userId: null,
        client: r.value.startsWith("cli:") ? "cli" : "api",
        keyName: r.keyName ?? "API key",
        count: r.count,
      };
    }
    return { value: r.value, kind: "user", userId: r.creator, client: null, keyName: null, count: r.count };
  });
}

export type PostForEdit = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: Date | null;
  mediaIds: string[] | null;
  connectedAccountIds: string[];
};

export async function getPostForEdit(
  postId: string,
  userId: string,
  workspaceId: string | null = null,
): Promise<PostForEdit | null> {
  const [post] = await db
    .select({
      id: posts.id,
      originalContent: posts.originalContent,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      mediaIds: posts.mediaIds,
    })
    .from(posts)
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.userId, userId),
        workspaceId
          ? eq(posts.workspaceId, workspaceId)
          : isNull(posts.workspaceId),
      ),
    );

  if (!post) return null;

  const pubs = await db
    .select({ connectedAccountId: postPublications.connectedAccountId })
    .from(postPublications)
    .where(eq(postPublications.postId, postId));

  return {
    id: post.id,
    originalContent: post.originalContent,
    status: post.status,
    scheduledAt: post.scheduledAt,
    mediaIds: post.mediaIds ?? [],
    connectedAccountIds: pubs
      .map((p) => p.connectedAccountId)
      .filter((id): id is string => id != null),
  };
}

export type PostMediaRow = {
  id: string;
  originalFilename: string;
  mimeType: string;
  url: string | null;
  thumbnailUrl: string | null;
};

export async function getPostMedia(
  userId: string,
  mediaIds: string[],
): Promise<PostMediaRow[]> {
  if (mediaIds.length === 0) return [];
  const rows = await db
    .select({
      id: mediaUploads.id,
      originalFilename: mediaUploads.originalFilename,
      mimeType: mediaUploads.mimeType,
      url: mediaUploads.url,
      thumbnailUrl: mediaUploads.thumbnailUrl,
    })
    .from(mediaUploads)
    .where(
      and(eq(mediaUploads.userId, userId), inArray(mediaUploads.id, mediaIds)),
    );
  const byId = new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        originalFilename: r.originalFilename,
        mimeType: r.mimeType,
        url: r.url,
        thumbnailUrl: r.thumbnailUrl,
      } satisfies PostMediaRow,
    ]),
  );
  return mediaIds
    .map((id) => byId.get(id))
    .filter((row): row is PostMediaRow => row != null);
}

export type PostDetailRow = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: Date | null;
  createdAt: Date | null;
  /** Last write to the row (bumped when a publish / retry starts). */
  updatedAt: Date | null;
  mediaIds: string[] | null;
  metadata: Record<string, unknown> | null;
  failureReason: string | null;
  /** Actor who created the post (null on rows from before Teams / old `/v1`). */
  createdByUserId: string | null;
};

/** Queued slot info when a post is in the queue (scheduled + has queued_posts row). */
export type QueuedSlotInfo = {
  slotId: string;
  scheduledFor: Date;
};

export async function getQueuedSlotForPost(
  postId: string,
  userId: string,
): Promise<QueuedSlotInfo | null> {
  const [row] = await db
    .select({
      slotId: queuedPosts.slotId,
      scheduledFor: queuedPosts.scheduledFor,
    })
    .from(queuedPosts)
    .where(
      and(
        eq(queuedPosts.postId, postId),
        eq(queuedPosts.userId, userId),
        eq(queuedPosts.status, "pending"),
      ),
    );
  if (!row?.slotId) return null;
  return {
    slotId: row.slotId,
    scheduledFor: row.scheduledFor,
  };
}

/** Resurface (autorepost) schedule for post detail when post has X published. */
export type ResurfaceDetail = {
  id: string;
  isActive: boolean;
  resurfacesDone: number;
  maxResurfaces: number;
  intervalHours: number;
  plugComment: string | null;
};

/** Auto-Plug row for post detail (X published). */
export type AutoPlugDetail = {
  id: string;
  status: string;
  metricType: string;
  metricThreshold: number;
  plugComment: string;
};

export type PostDetailResult = {
  post: PostDetailRow;
  publications: DashboardPublicationRow[];
  /** Set when post is scheduled and has a pending queued_posts entry */
  queuedSlot: QueuedSlotInfo | null;
  /** Set when post has Auto-Plug enabled (X published); latest row */
  autoPlug: AutoPlugDetail | null;
  /** Set when post has resurface/autorepost (X published); at most one schedule per post */
  resurface: ResurfaceDetail | null;
};

export type AdjacentPostsListContext = Pick<
  PostsListParams,
  | "workspaceId"
  | "statusFilter"
  | "sort"
  | "platform"
  | "time"
  | "account"
  | "query"
> &
  PostsTimeZoneParam & { source?: PostsSourceFilter | null };

/**
 * Neighbors for detail-page edge nav, in the same order/filters as the
 * list the user came from. prevId = left/← (earlier in list), nextId = right/→.
 * Skips drafts when browsing unfiltered lists (detail redirects drafts away).
 */
export async function getAdjacentPostIds(
  postId: string,
  userId: string,
  list: AdjacentPostsListContext = {},
): Promise<{ prevId: string | null; nextId: string | null }> {
  const sort = list.sort === "oldest" ? "oldest" : "newest";
  const workspaceId = list.workspaceId ?? null;
  const [current] = await db
    .select({ id: posts.id, createdAt: posts.createdAt })
    .from(posts)
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.userId, userId),
        workspaceId
          ? eq(posts.workspaceId, workspaceId)
          : isNull(posts.workspaceId),
      ),
    )
    .limit(1);

  if (!current?.createdAt) {
    return { prevId: null, nextId: null };
  }

  const createdAt = current.createdAt;
  const whereBase = buildPostsListWhere({
    userId,
    workspaceId,
    statusFilter: list.statusFilter,
    platform: list.platform,
    time: list.time,
    account: list.account,
    query: list.query,
    source: list.source,
    timeZone: list.timeZone,
    // All-posts / calendar: stay on detailable posts only.
    excludeDrafts: !list.statusFilter,
  });

  // ponytail: createdAt-only neighbors; same-ms ties are rare enough to ignore
  // newest: prev = newer (gt), next = older (lt)
  // oldest: prev = older (lt), next = newer (gt)
  const prevIsNewer = sort === "newest";

  const [prev] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        whereBase,
        ne(posts.id, postId),
        prevIsNewer
          ? gt(posts.createdAt, createdAt)
          : lt(posts.createdAt, createdAt),
      ),
    )
    .orderBy(prevIsNewer ? asc(posts.createdAt) : desc(posts.createdAt))
    .limit(1);

  const [next] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        whereBase,
        ne(posts.id, postId),
        prevIsNewer
          ? lt(posts.createdAt, createdAt)
          : gt(posts.createdAt, createdAt),
      ),
    )
    .orderBy(prevIsNewer ? desc(posts.createdAt) : asc(posts.createdAt))
    .limit(1);

  return {
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
}

/** Fetch a single post by id; verifies userId + workspace. Returns null if not found. */
export async function getPostDetail(
  postId: string,
  userId: string,
  workspaceId: string | null = null,
): Promise<PostDetailResult | null> {
  try {
    const [post] = await db
      .select({
        id: posts.id,
        originalContent: posts.originalContent,
        status: posts.status,
        scheduledAt: posts.scheduledAt,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        mediaIds: posts.mediaIds,
        metadata: posts.metadata,
        failureReason: posts.failureReason,
        createdByUserId: posts.createdByUserId,
      })
      .from(posts)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.userId, userId),
          workspaceId
            ? eq(posts.workspaceId, workspaceId)
            : isNull(posts.workspaceId),
        ),
      );

    if (!post) return null;

    const pubs = await db
      .select({
        publicationId: postPublications.id,
        connectedAccountId: postPublications.connectedAccountId,
        status: postPublications.status,
        platformPostUrl: postPublications.platformPostUrl,
        platformPostId: postPublications.platformPostId,
        platform: connectedAccounts.platform,
        lastError: postPublications.lastError,
        profileImageUrl: connectedAccounts.profileImageUrl,
        platformUsername: connectedAccounts.platformUsername,
        platformUserId: connectedAccounts.platformUserId,
        platformMetadata: connectedAccounts.platformMetadata,
        isTwitterPremium: connectedAccounts.isTwitterPremium,
        publishedAt: postPublications.publishedAt,
        tokenStatus: connectedAccounts.tokenStatus,
        reconnectedSinceFailure: reconnectedSinceFailureSql,
        /** No write for `STUCK_PUBLISHING_MINUTES`: a "publishing" row this old is not running. */
        idle: idlePublicationSql,
      })
      .from(postPublications)
      .innerJoin(
        connectedAccounts,
        eq(postPublications.connectedAccountId, connectedAccounts.id),
      )
      .where(eq(postPublications.postId, postId));

    let queuedSlot: QueuedSlotInfo | null = null;
    if (post.status === "scheduled") {
      queuedSlot = await getQueuedSlotForPost(postId, userId);
    }

    // A post that finished (failed / partial / published) can still hold rows
    // that never completed: show those as failed so they can be retried. Never
    // while the post itself is publishing: X / TikTok finish on the API in
    // seconds while the other networks still wait in the queue as "pending".
    // A "publishing" row on a finished post is a single-row retry in flight
    // unless it has sat untouched for a while.
    // A post stuck in "publishing" (same rule as stuckPublishingSql and the
    // SPA's effectiveStatus) reads as failed too.
    const postStuck =
      post.status === "publishing" && isPostPublishingStale(post);
    const postSettled =
      postStuck ||
      post.status === "failed" ||
      post.status === "partial" ||
      post.status === "published";
    const isStuck = (p: { status: string | null; idle: boolean }) =>
      p.status === "pending" || (p.status === "publishing" && p.idle);

    const normalizedPubs = pubs.map(({ idle, ...pub }) =>
      postSettled && isStuck({ status: pub.status, idle })
        ? {
            ...pub,
            status: "failed" as const,
            // An idle "publishing" row was mid-send when its run stopped and
            // may already be live: say so before the person retries it.
            lastError:
              pub.lastError ??
              (pub.status === "publishing"
                ? INTERRUPTED_PUBLISH_ERROR
                : (post.failureReason ??
                  "Publish did not complete for this platform")),
          }
        : pub,
    );

    const hasXPublished = normalizedPubs.some(
      (p) => p.platform === "twitter_x" && p.status === "published",
    );
    let autoPlug: AutoPlugDetail | null = null;
    let resurface: ResurfaceDetail | null = null;
    if (hasXPublished) {
      const [plug] = await db
        .select({
          id: autoPlugs.id,
          status: autoPlugs.status,
          metricType: autoPlugs.metricType,
          metricThreshold: autoPlugs.metricThreshold,
          plugComment: autoPlugs.plugComment,
        })
        .from(autoPlugs)
        .where(eq(autoPlugs.postId, postId))
        .orderBy(desc(autoPlugs.createdAt))
        .limit(1);
      if (plug)
        autoPlug = {
          id: plug.id,
          status: plug.status,
          metricType: plug.metricType,
          metricThreshold: plug.metricThreshold ?? 0,
          plugComment: plug.plugComment ?? "",
        };

      const [sched] = await db
        .select({
          id: resurfaceSchedules.id,
          isActive: resurfaceSchedules.isActive,
          resurfacesDone: resurfaceSchedules.resurfacesDone,
          maxResurfaces: resurfaceSchedules.maxResurfaces,
          intervalHours: resurfaceSchedules.intervalHours,
          plugComment: resurfaceSchedules.plugComment,
        })
        .from(resurfaceSchedules)
        .where(eq(resurfaceSchedules.postId, postId))
        .limit(1);
      if (sched)
        resurface = {
          id: sched.id,
          isActive: sched.isActive ?? true,
          resurfacesDone: sched.resurfacesDone ?? 0,
          maxResurfaces: sched.maxResurfaces,
          intervalHours: sched.intervalHours ?? 4,
          plugComment: sched.plugComment ?? null,
        };
    }

    return {
      post: {
        id: post.id,
        originalContent: post.originalContent,
        status: post.status,
        scheduledAt: post.scheduledAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        mediaIds: post.mediaIds,
        metadata: post.metadata ?? null,
        failureReason: post.failureReason ?? null,
        createdByUserId: post.createdByUserId ?? null,
      },
      publications: normalizedPubs,
      queuedSlot,
      autoPlug,
      resurface,
    };
  } catch {
    return null;
  }
}
