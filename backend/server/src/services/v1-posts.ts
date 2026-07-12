import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  connectedAccounts,
  mediaUploads,
  postPublications,
  posts,
} from "../db/schema.js";
import { checkFreePostLimit, incrementFreePostsUsed } from "../lib/plan-limits.js";
import { getPostDetail } from "../lib/posts-list/posts-list-data.js";
import { isValidUUID } from "../lib/validation.js";
import { emitUserWebhookEvent } from "../lib/user-webhook-delivery.js";
import {
  createPublishTrackingId,
  enqueuePublishPost,
} from "../services/enqueue.js";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SCHEDULE_FUTURE_GRACE_MS = 120_000;

function coerceDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function validateScheduledAt(scheduledAt: unknown): string | null {
  const date = coerceDate(scheduledAt);
  if (!date) return "scheduledAt must be a valid ISO datetime";
  const now = Date.now();
  const target = date.getTime();
  if (target < now - SCHEDULE_FUTURE_GRACE_MS) {
    return "scheduledAt must be in the future";
  }
  if (target > now + ONE_YEAR_MS) {
    return "scheduledAt must be within the next year";
  }
  return null;
}

function normalizeUuid(id: string): string {
  return id.toLowerCase();
}

function normalizeUuidList(ids: string[]): string[] {
  return ids.map(normalizeUuid);
}

async function validateOwnedAccounts(
  userId: string,
  accountIds: string[],
): Promise<string | null> {
  if (accountIds.length === 0) {
    return "At least one platform account is required";
  }
  if (!accountIds.every((id) => isValidUUID(id))) {
    return "Invalid account ID format";
  }
  const normalizedIds = normalizeUuidList(accountIds);
  const owned = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, userId),
        inArray(connectedAccounts.id, normalizedIds),
      ),
    );
  const ownedSet = new Set(owned.map((a) => a.id));
  const unique = [...new Set(normalizedIds)];
  if (unique.length !== ownedSet.size || !unique.every((id) => ownedSet.has(id))) {
    return "One or more accounts are invalid or do not belong to you";
  }
  return null;
}

async function validateOwnedMedia(
  userId: string,
  mediaIds: string[],
): Promise<string | null> {
  if (mediaIds.length === 0) return null;
  if (!mediaIds.every((id) => isValidUUID(id))) {
    return "Invalid media ID format";
  }
  const normalizedIds = normalizeUuidList(mediaIds);
  const owned = await db
    .select({ id: mediaUploads.id })
    .from(mediaUploads)
    .where(
      and(
        eq(mediaUploads.userId, userId),
        inArray(mediaUploads.id, normalizedIds),
      ),
    );
  const ownedSet = new Set(owned.map((m) => m.id));
  if (!normalizedIds.every((id) => ownedSet.has(id))) {
    return "One or more media files are invalid or do not belong to you";
  }
  return null;
}

type V1PostForm = "text" | "image" | "video" | "collection";

const FORM_PLATFORMS: Record<V1PostForm, string[]> = {
  text: ["facebook", "bluesky", "twitter_x", "linkedin", "threads"],
  image: [
    "facebook",
    "bluesky",
    "twitter_x",
    "linkedin",
    "threads",
    "pinterest",
    "tiktok",
    "instagram",
  ],
  video: [
    "facebook",
    "bluesky",
    "twitter_x",
    "linkedin",
    "threads",
    "youtube",
    "pinterest",
    "tiktok",
    "instagram",
  ],
  collection: ["twitter_x", "threads", "instagram"],
};

function inferPostFormFromMimeTypes(mimeTypes: string[]): V1PostForm {
  if (mimeTypes.length === 0) return "text";
  const videoCount = mimeTypes.filter((m) => m.startsWith("video/")).length;
  const imageCount = mimeTypes.filter((m) => m.startsWith("image/")).length;
  const knownMediaCount = videoCount + imageCount;
  if (knownMediaCount > 1 && videoCount > 0) return "collection";
  if (videoCount === 1) return "video";
  return "image";
}

async function validateTargetsForMedia(
  userId: string,
  accountIds: string[],
  mediaIds: string[],
): Promise<string | null> {
  if (accountIds.length === 0) return "At least one platform account is required";

  const [accounts, media] = await Promise.all([
    db
      .select({ id: connectedAccounts.id, platform: connectedAccounts.platform })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, userId),
          inArray(connectedAccounts.id, accountIds),
        ),
      ),
    mediaIds.length
      ? db
          .select({ id: mediaUploads.id, mimeType: mediaUploads.mimeType })
          .from(mediaUploads)
          .where(
            and(
              eq(mediaUploads.userId, userId),
              inArray(mediaUploads.id, mediaIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const form = inferPostFormFromMimeTypes(media.map((m) => m.mimeType ?? ""));
  const allowed = new Set(FORM_PLATFORMS[form]);
  const unsupported = accounts.filter((a) => !allowed.has(a.platform));
  if (unsupported.length === 0) return null;

  const platform = unsupported[0]!.platform;
  const supported = FORM_PLATFORMS[form].join(", ");
  if (form === "collection" && platform === "youtube") {
    return `YouTube supports one video per post. You attached ${mediaIds.length} media items, so Social0 treats this as a collection. Remove extra media or publish the collection to: ${supported}.`;
  }
  return `${platform} does not support ${form} posts in Social0 (supported for this content: ${supported}).`;
}

async function gateFreeQuota(userId: string): Promise<string | null> {
  const limit = await checkFreePostLimit(userId);
  if (limit.allowed) return null;
  return limit.reason ?? "Free post limit reached. Upgrade to continue.";
}

export type V1CreatePostInput = {
  content: string;
  platforms: string[];
  media?: string[];
  metadata?: Record<string, unknown>;
};

export async function v1CreateDraft(
  userId: string,
  input: V1CreatePostInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const content = input.content?.trim() ?? "";
  if (!content && (!input.media || input.media.length === 0)) {
    return { ok: false, error: "content or media is required" };
  }

  const accountErr = await validateOwnedAccounts(userId, input.platforms);
  if (accountErr) return { ok: false, error: accountErr };

  const mediaIds = normalizeUuidList(input.media ?? []);
  const mediaErr = await validateOwnedMedia(userId, mediaIds);
  if (mediaErr) return { ok: false, error: mediaErr };

  const uniqueAccounts = [...new Set(normalizeUuidList(input.platforms))];
  const targetErr = await validateTargetsForMedia(userId, uniqueAccounts, mediaIds);
  if (targetErr) return { ok: false, error: targetErr };

  const [row] = await db
    .insert(posts)
    .values({
      userId,
      originalContent: content,
      finalContent: content,
      status: "draft",
      mediaIds,
      metadata: input.metadata ?? null,
    })
    .returning({ id: posts.id });

  if (!row) return { ok: false, error: "Failed to create post" };

  await db.insert(postPublications).values(
    uniqueAccounts.map((connectedAccountId) => ({
      postId: row.id,
      connectedAccountId,
      status: "pending" as const,
    })),
  );

  return { ok: true, id: row.id };
}

export async function v1ListPosts(
  userId: string,
  opts: {
    page?: number;
    limit?: number;
    status?: string;
    platform?: string;
    connectedAccountId?: string;
    search?: string;
  },
) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions = [eq(posts.userId, userId)];

  if (opts.status) {
    conditions.push(eq(posts.status, opts.status as typeof posts.status.enumValues[number]));
  }

  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    conditions.push(
      or(
        ilike(posts.originalContent, q),
        ilike(posts.finalContent, q),
      )!,
    );
  }

  if (opts.platform) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM post_publications pp
        INNER JOIN connected_accounts ca ON ca.id = pp.connected_account_id
        WHERE pp.post_id = ${posts.id} AND ca.platform = ${opts.platform}
      )`,
    );
  }

  if (opts.connectedAccountId) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM post_publications pp
        WHERE pp.post_id = ${posts.id}
          AND pp.connected_account_id = ${opts.connectedAccountId}::uuid
      )`,
    );
  }

  const where = and(...conditions);

  const [rows, countRow] = await Promise.all([
    db
      .select({
        id: posts.id,
        content: posts.finalContent,
        status: posts.status,
        scheduledAt: posts.scheduledAt,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        mediaIds: posts.mediaIds,
      })
      .from(posts)
      .where(where)
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(where),
  ]);

  const total = countRow[0]?.count ?? 0;

  return {
    data: rows.map((p) => ({
      id: p.id,
      content: p.content,
      status: p.status,
      scheduled_at: p.scheduledAt?.toISOString() ?? null,
      created_at: p.createdAt?.toISOString() ?? null,
      updated_at: p.updatedAt?.toISOString() ?? null,
      media_ids: p.mediaIds ?? [],
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

export async function v1GetPost(userId: string, postId: string) {
  if (!isValidUUID(postId)) return null;
  const detail = await getPostDetail(postId, userId);
  if (!detail) return null;

  return {
    id: detail.post.id,
    content: detail.post.originalContent,
    status: detail.post.status,
    scheduled_at: detail.post.scheduledAt?.toISOString() ?? null,
    created_at: detail.post.createdAt?.toISOString() ?? null,
    failure_reason: detail.post.failureReason ?? null,
    media_ids: detail.post.mediaIds ?? [],
    metadata: detail.post.metadata ?? null,
    platforms: detail.publications.map((p) => ({
      publication_id: p.publicationId,
      connected_account_id: p.connectedAccountId,
      platform: p.platform,
      status: p.status,
      platform_post_id: p.platformPostId ?? null,
      platform_post_url: p.platformPostUrl ?? null,
      published_at: p.publishedAt?.toISOString() ?? null,
      error: p.lastError ?? null,
    })),
  };
}

export async function v1UpdateDraft(
  userId: string,
  postId: string,
  input: Partial<V1CreatePostInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidUUID(postId)) return { ok: false, error: "Invalid post ID" };

  const [existing] = await db
    .select({ id: posts.id, status: posts.status, mediaIds: posts.mediaIds })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  if (!existing) return { ok: false, error: "Post not found" };
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return { ok: false, error: "Only draft or scheduled posts can be updated" };
  }

  const updates: Partial<typeof posts.$inferInsert> = { updatedAt: new Date() };
  const existingPublications = input.platforms
    ? []
    : await db
        .select({ connectedAccountId: postPublications.connectedAccountId })
        .from(postPublications)
        .where(eq(postPublications.postId, postId));
  const finalMediaIds = normalizeUuidList(input.media ?? existing.mediaIds ?? []);
  const finalAccountIds =
    (input.platforms ? normalizeUuidList(input.platforms) : undefined) ??
    existingPublications
      .map((p) => p.connectedAccountId)
      .filter((id): id is string => typeof id === "string");

  if (input.content !== undefined) {
    const trimmed = input.content.trim();
    if (!trimmed && finalMediaIds.length === 0) {
      return { ok: false, error: "content or media is required" };
    }
    updates.originalContent = trimmed;
    updates.finalContent = trimmed;
  }

  if (input.media !== undefined) {
    const normalizedMedia = normalizeUuidList(input.media);
    const mediaErr = await validateOwnedMedia(userId, normalizedMedia);
    if (mediaErr) return { ok: false, error: mediaErr };
    updates.mediaIds = normalizedMedia;
  }

  if (input.platforms) {
    const accountErr = await validateOwnedAccounts(userId, normalizeUuidList(input.platforms));
    if (accountErr) return { ok: false, error: accountErr };
  }

  if (input.platforms || input.media) {
    const targetErr = await validateTargetsForMedia(userId, finalAccountIds, finalMediaIds);
    if (targetErr) return { ok: false, error: targetErr };
  }

  if (input.metadata !== undefined) {
    updates.metadata = input.metadata;
  }

  await db.update(posts).set(updates).where(eq(posts.id, postId));

  if (input.platforms) {
    const uniqueAccounts = [...new Set(normalizeUuidList(input.platforms))];
    await db
      .delete(postPublications)
      .where(eq(postPublications.postId, postId));
    await db.insert(postPublications).values(
      uniqueAccounts.map((connectedAccountId) => ({
        postId,
        connectedAccountId,
        status: "pending" as const,
      })),
    );
  }

  return { ok: true };
}

export async function v1DeletePost(
  userId: string,
  postId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidUUID(postId)) return { ok: false, error: "Invalid post ID" };

  const [existing] = await db
    .select({ id: posts.id, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  if (!existing) return { ok: false, error: "Post not found" };
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return { ok: false, error: "Only draft or scheduled posts can be deleted" };
  }

  await db.delete(postPublications).where(eq(postPublications.postId, postId));
  await db.delete(posts).where(eq(posts.id, postId));

  emitUserWebhookEvent(userId, "post.deleted", { post_id: postId });

  return { ok: true };
}

export async function v1SchedulePost(
  userId: string,
  postId: string,
  scheduledAt: string,
): Promise<{ ok: true; scheduled_at: string } | { ok: false; error: string }> {
  if (!isValidUUID(postId)) return { ok: false, error: "Invalid post ID" };

  const scheduleErr = validateScheduledAt(scheduledAt);
  if (scheduleErr) return { ok: false, error: scheduleErr };

  const [existing] = await db
    .select({ id: posts.id, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  if (!existing) return { ok: false, error: "Post not found" };
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return { ok: false, error: "Only draft or scheduled posts can be scheduled" };
  }

  if (existing.status === "draft") {
    const quotaErr = await gateFreeQuota(userId);
    if (quotaErr) return { ok: false, error: quotaErr };
    await incrementFreePostsUsed(userId);
  }

  const at = coerceDate(scheduledAt)!;
  await db
    .update(posts)
    .set({
      status: "scheduled",
      scheduledAt: at,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId));

  emitUserWebhookEvent(userId, "post.scheduled", {
    post_id: postId,
    scheduled_at: at.toISOString(),
  });

  return { ok: true, scheduled_at: at.toISOString() };
}

export async function v1PublishPost(
  app: FastifyInstance,
  userId: string,
  postId: string,
  connectedAccountIds?: string[],
): Promise<
  | {
      ok: true;
      tracking_id: string;
      status: string;
      stream_url: string;
    }
  | { ok: false; error: string }
> {
  if (!isValidUUID(postId)) return { ok: false, error: "Invalid post ID" };

  const [existing] = await db
    .select({ id: posts.id, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  if (!existing) return { ok: false, error: "Post not found" };

  if (existing.status === "draft") {
    const quotaErr = await gateFreeQuota(userId);
    if (quotaErr) return { ok: false, error: quotaErr };
    await incrementFreePostsUsed(userId);
  }

  const trackingId = createPublishTrackingId();

  try {
    const job = await enqueuePublishPost(
      app,
      { postId, userId, trackingId, connectedAccountIds },
      { trackingId },
    );
    if (job.enqueued === 0) {
      return { ok: false, error: "Post not found or not publishable" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to enqueue publish";
    if (message.includes("No publication targets")) {
      return { ok: false, error: "Post not found or not publishable" };
    }
    throw err;
  }

  return {
    ok: true,
    tracking_id: trackingId,
    status: "queued",
    stream_url: `/v1/jobs/${trackingId}/stream`,
  };
}

export async function v1CreateAndPublish(
  app: FastifyInstance,
  userId: string,
  input: V1CreatePostInput,
): Promise<
  | { ok: true; post_id: string; tracking_id: string; stream_url: string }
  | { ok: false; error: string }
> {
  const created = await v1CreateDraft(userId, input);
  if (!created.ok) return created;

  const published = await v1PublishPost(app, userId, created.id);
  if (!published.ok) {
    await v1DeletePost(userId, created.id);
    return published;
  }

  return {
    ok: true,
    post_id: created.id,
    tracking_id: published.tracking_id,
    stream_url: published.stream_url,
  };
}

export async function v1CreateAndSchedule(
  userId: string,
  input: V1CreatePostInput & { scheduledAt: string },
): Promise<
  | { ok: true; post_id: string; scheduled_at: string }
  | { ok: false; error: string }
> {
  const scheduleErr = validateScheduledAt(input.scheduledAt);
  if (scheduleErr) return { ok: false, error: scheduleErr };

  const created = await v1CreateDraft(userId, input);
  if (!created.ok) return created;

  const scheduled = await v1SchedulePost(userId, created.id, input.scheduledAt);
  if (!scheduled.ok) {
    await v1DeletePost(userId, created.id);
    return scheduled;
  }

  return {
    ok: true,
    post_id: created.id,
    scheduled_at: scheduled.scheduled_at,
  };
}
