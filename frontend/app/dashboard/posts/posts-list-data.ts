import { db } from "@/db";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
} from "@/db/schema";
import { eq, desc, asc, inArray, and } from "drizzle-orm";
import { startOfWeek, startOfMonth } from "date-fns";

export type StatusFilter = "draft" | "scheduled" | "published" | null;

export type PostsListParams = {
  userId: string;
  statusFilter?: StatusFilter;
  sort?: "newest" | "oldest";
  platform?: string | null;
  time?: string | null;
  account?: string | null;
};

export type PublicationRow = {
  connectedAccountId: string;
  status: string | null;
  platformPostUrl: string | null;
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
}: PostsListParams) {
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

  const firstIds = userPosts
    .map((p) => (p.mediaIds ?? [])[0])
    .filter((id): id is string => !!id);
  const firstMediaByPost = new Map<string, string>();
  if (firstIds.length > 0) {
    const medias = await db
      .select({ id: mediaUploads.id, mimeType: mediaUploads.mimeType })
      .from(mediaUploads)
      .where(inArray(mediaUploads.id, firstIds));
    for (const p of userPosts) {
      const firstId = (p.mediaIds ?? [])[0];
      if (firstId) {
        const media = medias.find((m) => m.id === firstId);
        if (media) firstMediaByPost.set(p.id, media.mimeType);
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

  return {
    userPosts,
    publicationsByPostId,
    firstMediaByPost,
    platformOptions,
    accountOptions,
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
