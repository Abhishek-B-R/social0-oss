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
import { eq, desc, asc, inArray, and, sql, gte, exists } from "drizzle-orm";
import { startOfWeek, startOfMonth } from "date-fns";
import { getSubscriptionForUser } from "@/lib/subscription";
import { isActiveTier } from "@social0/shared";
import { POSTS_PAGE_SIZE } from "@social0/shared";
import type { PublicationRow, PostsListParams } from "@social0/shared";

export { POSTS_PAGE_SIZE } from "@social0/shared";
export type {
  PublicationRow,
  PostsListParams,
  StatusFilter,
} from "@social0/shared";

/** True if the user has payment-failed posts and no active subscription (so banner should show). */
export async function hasPaymentFailedPosts(userId: string): Promise<boolean> {
  const subscription = await getSubscriptionForUser(userId);
  if (isActiveTier(subscription.tier)) return false;

  const [row] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.userId, userId),
        eq(posts.status, "failed"),
        sql`${posts.failureReason} LIKE '%Payment required%'`,
      ),
    )
    .limit(1);
  return !!row?.id;
}

export async function getPostsListData({
  userId,
  statusFilter,
  sort = "newest",
  platform: platformFilter,
  time: timeFilter,
  account: accountFilter,
  page = 1,
  limit = POSTS_PAGE_SIZE,
  offset: offsetParam,
}: PostsListParams) {
  const offset = offsetParam ?? (page - 1) * limit;

  // Build WHERE fully in DB - no in-memory filtering after this point
  const timeFilterDate =
    timeFilter === "week"
      ? startOfWeek(new Date(), { weekStartsOn: 1 })
      : timeFilter === "month"
        ? startOfMonth(new Date())
        : null;

  const whereClause = and(
    eq(posts.userId, userId),
    statusFilter ? eq(posts.status, statusFilter) : undefined,
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

  // COUNT + paginated SELECT - two fast indexed queries instead of one full scan
  const [[countRow], userPosts] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(whereClause),
    db
      .select({
        id: posts.id,
        originalContent: posts.originalContent,
        status: posts.status,
        scheduledAt: posts.scheduledAt,
        failureReason: posts.failureReason,
        createdAt: posts.createdAt,
        mediaIds: posts.mediaIds,
        metadata: posts.metadata,
      })
      .from(posts)
      .where(whereClause)
      .orderBy(sort === "oldest" ? asc(posts.createdAt) : desc(posts.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const totalCount = countRow?.count ?? 0;
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
    {} as Record<string, PublicationRow[]>,
  );

  // Fix posts stuck in "publishing" when publications have finished (all published or mixed)
  const toFixPublishedIds = userPosts
    .filter(
      (p) =>
        p.status === "publishing" &&
        (publicationsByPostId[p.id] ?? []).length > 0 &&
        (publicationsByPostId[p.id] ?? []).every(
          (pub) => pub.status === "published",
        ),
    )
    .map((p) => p.id);
  if (toFixPublishedIds.length > 0) {
    await db
      .update(posts)
      .set({ status: "published", updatedAt: new Date() })
      .where(inArray(posts.id, toFixPublishedIds));
  }
  const toFixPartialIds = userPosts
    .filter((p) => {
      if (p.status !== "publishing") return false;
      const pubs = publicationsByPostId[p.id] ?? [];
      if (pubs.length === 0) return false;
      const somePublished = pubs.some((pub) => pub.status === "published");
      const someFailed = pubs.some((pub) => pub.status === "failed");
      return somePublished && someFailed;
    })
    .map((p) => p.id);
  if (toFixPartialIds.length > 0) {
    await db
      .update(posts)
      .set({ status: "partial", updatedAt: new Date() })
      .where(inArray(posts.id, toFixPartialIds));
  }

  const platforms = [...new Set(publications.map((p) => p.platform))];
  const accountIds = [
    ...new Set(
      publications
        .map((p) => p.connectedAccountId)
        .filter((id): id is string => id != null),
    ),
  ];

  // Use derived status: "publishing" -> "published" when all succeeded, "partial" when mixed
  const userPostsWithStatus = userPosts.map((p) => {
    const pubs = publicationsByPostId[p.id] ?? [];
    let effectiveStatus = p.status;
    if (p.status === "publishing" && pubs.length > 0) {
      const allPublished = pubs.every((pub) => pub.status === "published");
      const somePublished = pubs.some((pub) => pub.status === "published");
      const someFailed = pubs.some((pub) => pub.status === "failed");
      if (allPublished) effectiveStatus = "published";
      else if (somePublished && someFailed) effectiveStatus = "partial";
    }
    return { ...p, status: effectiveStatus };
  });

  const firstIds = userPostsWithStatus
    .map((p) => (p.mediaIds ?? [])[0])
    .filter((id): id is string => !!id);
  const firstMediaByPost = new Map<
    string,
    { mimeType: string; originalFilename: string | null }
  >();
  if (firstIds.length > 0) {
    const medias = await db
      .select({
        id: mediaUploads.id,
        mimeType: mediaUploads.mimeType,
        originalFilename: mediaUploads.originalFilename,
      })
      .from(mediaUploads)
      .where(inArray(mediaUploads.id, firstIds));
    for (const p of userPostsWithStatus) {
      const firstId = (p.mediaIds ?? [])[0];
      if (firstId) {
        const media = medias.find((m) => m.id === firstId);
        if (media) {
          firstMediaByPost.set(p.id, {
            mimeType: media.mimeType,
            originalFilename: media.originalFilename ?? null,
          });
        }
      }
    }
  }

  const connectedAccountsList =
    accountIds.length > 0
      ? await db
          .select({
            id: connectedAccounts.id,
            platform: connectedAccounts.platform,
            platformUsername: connectedAccounts.platformUsername,
          })
          .from(connectedAccounts)
          .where(
            and(
              eq(connectedAccounts.userId, userId),
              inArray(connectedAccounts.id, accountIds),
            ),
          )
      : [];

  const platformOptions = platforms.map((id) => ({
    value: id,
    label: id.charAt(0).toUpperCase() + id.slice(1).replace("_", " "),
  }));
  const accountOptions = connectedAccountsList.map((a) => ({
    value: a.id,
    label: `@${a.platformUsername || a.platform} (${a.platform})`,
  }));

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
  const queuedPostIds =
    pagePostIds.length > 0
      ? new Set(
          (
            await db
              .select({ postId: queuedPosts.postId })
              .from(queuedPosts)
              .where(
                and(
                  eq(queuedPosts.userId, userId),
                  eq(queuedPosts.status, "pending"),
                  inArray(queuedPosts.postId, pagePostIds),
                ),
              )
          ).map((r) => r.postId),
        )
      : new Set<string>();

  return {
    userPosts: userPostsWithStatus,
    publicationsByPostId,
    firstMediaByPost,
    platformOptions,
    accountOptions,
    resurfaceByPostId,
    totalCount,
    queuedPostIds,
  };
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
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

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
  mediaIds: string[] | null;
  metadata: Record<string, unknown> | null;
  failureReason: string | null;
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
  publications: PublicationRow[];
  /** Set when post is scheduled and has a pending queued_posts entry */
  queuedSlot: QueuedSlotInfo | null;
  /** Set when post has Auto-Plug enabled (X published); latest row */
  autoPlug: AutoPlugDetail | null;
  /** Set when post has resurface/autorepost (X published); at most one schedule per post */
  resurface: ResurfaceDetail | null;
};

/** Fetch a single post by id; verifies userId. Returns null if not found, not owner, or invalid id. */
export async function getPostDetail(
  postId: string,
  userId: string,
): Promise<PostDetailResult | null> {
  try {
    const [post] = await db
      .select({
        id: posts.id,
        originalContent: posts.originalContent,
        status: posts.status,
        scheduledAt: posts.scheduledAt,
        createdAt: posts.createdAt,
        mediaIds: posts.mediaIds,
        metadata: posts.metadata,
        failureReason: posts.failureReason,
      })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

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

    const hasStuckPubs = pubs.some(
      (p) => p.status === "pending" || p.status === "publishing",
    );
    const hasTerminalPubs = pubs.some(
      (p) => p.status === "published" || p.status === "failed",
    );
    const shouldNormalizeStuckPubs =
      hasStuckPubs &&
      (post.failureReason?.trim() ||
        post.status === "failed" ||
        post.status === "partial" ||
        post.status === "published" ||
        hasTerminalPubs);

    const normalizedPubs = shouldNormalizeStuckPubs
      ? pubs.map((pub) =>
          pub.status === "pending" || pub.status === "publishing"
            ? {
                ...pub,
                status: "failed" as const,
                lastError:
                  pub.lastError ??
                  post.failureReason ??
                  "Publish did not complete for this platform",
              }
            : pub,
        )
      : pubs;

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
        mediaIds: post.mediaIds,
        metadata: post.metadata ?? null,
        failureReason: post.failureReason ?? null,
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
