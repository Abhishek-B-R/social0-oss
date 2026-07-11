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
  const owned = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, userId),
        inArray(connectedAccounts.id, accountIds),
      ),
    );
  const ownedSet = new Set(owned.map((a) => a.id));
  const unique = [...new Set(accountIds)];
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
  const owned = await db
    .select({ id: mediaUploads.id })
    .from(mediaUploads)
    .where(
      and(
        eq(mediaUploads.userId, userId),
        inArray(mediaUploads.id, mediaIds),
      ),
    );
  const ownedSet = new Set(owned.map((m) => m.id));
  if (!mediaIds.every((id) => ownedSet.has(id))) {
    return "One or more media files are invalid or do not belong to you";
  }
  return null;
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

  const mediaIds = input.media ?? [];
  const mediaErr = await validateOwnedMedia(userId, mediaIds);
  if (mediaErr) return { ok: false, error: mediaErr };

  const uniqueAccounts = [...new Set(input.platforms)];

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
    .select({ id: posts.id, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  if (!existing) return { ok: false, error: "Post not found" };
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return { ok: false, error: "Only draft or scheduled posts can be updated" };
  }

  const updates: Partial<typeof posts.$inferInsert> = { updatedAt: new Date() };

  if (input.content !== undefined) {
    const trimmed = input.content.trim();
    if (!trimmed && (!input.media || input.media.length === 0)) {
      return { ok: false, error: "content or media is required" };
    }
    updates.originalContent = trimmed;
    updates.finalContent = trimmed;
  }

  if (input.media !== undefined) {
    const mediaErr = await validateOwnedMedia(userId, input.media);
    if (mediaErr) return { ok: false, error: mediaErr };
    updates.mediaIds = input.media;
  }

  if (input.metadata !== undefined) {
    updates.metadata = input.metadata;
  }

  await db.update(posts).set(updates).where(eq(posts.id, postId));

  if (input.platforms) {
    const accountErr = await validateOwnedAccounts(userId, input.platforms);
    if (accountErr) return { ok: false, error: accountErr };

    const uniqueAccounts = [...new Set(input.platforms)];
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
