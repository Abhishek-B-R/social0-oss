import { db } from "@/db";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
  resurfaceSchedules,
  autoPlugs,
} from "@/db/schema";
import { eq, desc, asc, inArray, and } from "drizzle-orm";
import { startOfWeek, startOfMonth } from "date-fns";

export const POSTS_PAGE_SIZE = 18;

export type StatusFilter = "draft" | "scheduled" | "published" | null;

export type PostsListParams = {
  userId: string;
  statusFilter?: StatusFilter;
  sort?: "newest" | "oldest";
  platform?: string | null;
  time?: string | null;
  account?: string | null;
  /** 1-based page number; used with limit/offset for pagination */
  page?: number;
  limit?: number;
  offset?: number;
};

export type PublicationRow = {
  connectedAccountId: string;
  status: string | null;
  platformPostUrl: string | null;
  platformPostId: string | null;
  platform: string;
  lastError: string | null;
  profileImageUrl: string | null;
  platformUsername: string | null;
  publishedAt: Date | null;
};

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

  const whereClause = statusFilter
    ? and(eq(posts.userId, userId), eq(posts.status, statusFilter))
    : eq(posts.userId, userId);

  let userPosts = await db
    .select({
      id: posts.id,
      originalContent: posts.originalContent,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      createdAt: posts.createdAt,
      mediaIds: posts.mediaIds,
      metadata: posts.metadata,
    })
    .from(posts)
    .where(whereClause)
    .orderBy(sort === "oldest" ? asc(posts.createdAt) : desc(posts.createdAt));

  const postIds = userPosts.map((p) => p.id);
  const publications =
    postIds.length > 0
      ? await db
          .select({
            postId: postPublications.postId,
            connectedAccountId: postPublications.connectedAccountId,
            status: postPublications.status,
            platformPostUrl: postPublications.platformPostUrl,
            platformPostId: postPublications.platformPostId,
            platform: connectedAccounts.platform,
            lastError: postPublications.lastError,
            profileImageUrl: connectedAccounts.profileImageUrl,
            platformUsername: connectedAccounts.platformUsername,
            publishedAt: postPublications.publishedAt,
          })
          .from(postPublications)
          .innerJoin(
            connectedAccounts,
            eq(postPublications.connectedAccountId, connectedAccounts.id)
          )
          .where(inArray(postPublications.postId, postIds))
      : [];

  const publicationsByPostId = publications.reduce(
    (acc, p) => {
      if (!acc[p.postId]) acc[p.postId] = [];
      acc[p.postId].push(p);
      return acc;
    },
    {} as Record<string, PublicationRow[]>
  );

  // Fix posts stuck in "publishing" when publications have finished (all published or mixed)
  const toFixPublishedIds = userPosts
    .filter(
      (p) =>
        p.status === "publishing" &&
        (publicationsByPostId[p.id] ?? []).length > 0 &&
        (publicationsByPostId[p.id] ?? []).every(
          (pub) => pub.status === "published"
        )
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
  const accountIds = [...new Set(publications.map((p) => p.connectedAccountId))];

  if (platformFilter) {
    userPosts = userPosts.filter((p) =>
      (publicationsByPostId[p.id] ?? []).some(
        (pub) => pub.platform === platformFilter
      )
    );
  }
  if (accountFilter) {
    userPosts = userPosts.filter((p) =>
      (publicationsByPostId[p.id] ?? []).some(
        (pub) => pub.connectedAccountId === accountFilter
      )
    );
  }
  if (timeFilter === "week") {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    userPosts = userPosts.filter((p) => {
      const d = p.createdAt ? new Date(p.createdAt) : null;
      return d && d >= weekStart;
    });
  } else if (timeFilter === "month") {
    const monthStart = startOfMonth(new Date());
    userPosts = userPosts.filter((p) => {
      const d = p.createdAt ? new Date(p.createdAt) : null;
      return d && d >= monthStart;
    });
  }

  const totalCount = userPosts.length;
  const pagePosts = userPosts.slice(offset, offset + limit);

  // Use derived status: "publishing" -> "published" when all succeeded, "partial" when mixed
  const userPostsWithStatus = pagePosts.map((p) => {
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
              inArray(connectedAccounts.id, accountIds)
            )
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

  const postIdsWithXPublished = userPostsWithStatus.filter((p) =>
    (publicationsByPostId[p.id] ?? []).some(
      (pub) => pub.platform === "twitter_x" && pub.status === "published",
    ),
  ).map((p) => p.id);

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
          .catch(() => ({} as ResurfaceMap));

  type AutoPlugMap = Record<string, { status: string }>;
  const autoPlugByPostId: AutoPlugMap =
    postIdsWithXPublished.length === 0
      ? {}
      : await db
          .select({
            postId: autoPlugs.postId,
            status: autoPlugs.status,
          })
          .from(autoPlugs)
          .where(inArray(autoPlugs.postId, postIdsWithXPublished))
          .orderBy(desc(autoPlugs.createdAt))
          .then((rows) => {
            const out: AutoPlugMap = {};
            for (const r of rows) {
              if (out[r.postId] == null) out[r.postId] = { status: r.status };
            }
            return out;
          })
          .catch(() => ({} as AutoPlugMap));

  return {
    userPosts: userPostsWithStatus,
    publicationsByPostId,
    firstMediaByPost,
    platformOptions,
    accountOptions,
    resurfaceByPostId,
    autoPlugByPostId,
    totalCount,
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
    .where(
      and(eq(posts.id, postId), eq(posts.userId, userId)),
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
    connectedAccountIds: pubs.map((p) => p.connectedAccountId),
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
      and(
        eq(mediaUploads.userId, userId),
        inArray(mediaUploads.id, mediaIds),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    originalFilename: r.originalFilename,
    mimeType: r.mimeType,
    url: r.url,
    thumbnailUrl: r.thumbnailUrl,
  }));
}

export type PostDetailRow = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: Date | null;
  createdAt: Date | null;
  mediaIds: string[] | null;
  metadata: Record<string, unknown> | null;
};

/** Fetch a single post by id; verifies userId. Returns null if not found, not owner, or invalid id. */
export async function getPostDetail(
  postId: string,
  userId: string,
): Promise<{ post: PostDetailRow; publications: PublicationRow[] } | null> {
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
      })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    if (!post) return null;

    const pubs = await db
      .select({
        connectedAccountId: postPublications.connectedAccountId,
        status: postPublications.status,
        platformPostUrl: postPublications.platformPostUrl,
        platformPostId: postPublications.platformPostId,
        platform: connectedAccounts.platform,
        lastError: postPublications.lastError,
        profileImageUrl: connectedAccounts.profileImageUrl,
        platformUsername: connectedAccounts.platformUsername,
        publishedAt: postPublications.publishedAt,
      })
      .from(postPublications)
      .innerJoin(
        connectedAccounts,
        eq(postPublications.connectedAccountId, connectedAccounts.id),
      )
      .where(eq(postPublications.postId, postId));

    return {
      post: {
        id: post.id,
        originalContent: post.originalContent,
        status: post.status,
        scheduledAt: post.scheduledAt,
        createdAt: post.createdAt,
        mediaIds: post.mediaIds,
        metadata: post.metadata ?? null,
      },
      publications: pubs,
    };
  } catch {
    return null;
  }
}
