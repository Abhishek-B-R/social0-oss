
import { db } from "@/db";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
  queuedPosts,
} from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { requireWorkspaceSession } from "@/lib/workspace/session";
import { connectionScopeCondition, postScopeCondition } from "@/lib/workspace/context";
import { enqueuePublishPostStandalone } from "./enqueue.js";
import { userOwnsQueueSlot } from "@/lib/queue-slot-validation";
import {
  getPostForEdit,
  getPostMedia,
  getQueuedSlotForPost,
  type PostMediaRow,
} from "@/lib/posts-list/posts-list-data";
import { isValidUUID } from "@/lib/validation";
import { applyBulkAutoFeaturesToScheduledMetadata } from "@/lib/bulk-auto-features-metadata";
import { checkFreePostLimit, incrementFreePostsUsed } from "@/lib/plan-limits";
import { logPublishBlocked } from "@social0/shared";
import type {
  AutoPlugConfig,
  AutoResurfaceConfig,
} from "@/lib/auto-features-types";
import { getUserSettingsSnapshot } from "@/services/settings";

/**
 * Free-tier quota: exactly one free post is consumed when the user hits
 * "Publish now" or "Schedule" (the submission actions below). The publish
 * pipeline itself never counts - it may run many times per post (per-platform
 * progress, safety-net republish, retries, cron).
 * Returns an error message when the user is out of free posts, else null.
 */
async function gateFreePostQuota(
  userId: string,
  postId?: string,
): Promise<string | null> {
  const limit = await checkFreePostLimit(userId);
  if (limit.allowed) return null;
  logPublishBlocked("free_post_limit", userId, postId, {
    used: limit.used,
    limit: limit.limit,
  });
  return (
    limit.reason ?? "You've used your free posts. Upgrade to continue posting."
  );
}

export type PostAgainResult =
  | {
      success: true;
      newPostId: string;
      queued?: boolean;
      trackingId?: string;
      streamUrl?: string;
    }
  | { success: false; error: string };

export type CreatePostResult =
  | {
      success: true;
      postId: string;
      allPlatformsFailed?: boolean;
      queued?: boolean;
      trackingId?: string;
      streamUrl?: string;
    }
  | { success: false; error: string };

export type PublishMode = "draft" | "now" | "scheduled";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Allow a few minutes of client/server clock skew and network delay (was causing false failures). */
const SCHEDULE_FUTURE_GRACE_MS = 120_000;

/** RPC/JSON may pass ISO strings instead of Date instances. */
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

function validateScheduledAtWindow(scheduledAt: unknown): string | null {
  const date = coerceDate(scheduledAt);
  if (!date) return "Please pick a date and time to schedule";
  const now = Date.now();
  const target = date.getTime();
  if (Number.isNaN(target)) return "Please pick a valid schedule date and time";
  if (target < now - SCHEDULE_FUTURE_GRACE_MS) {
    return "Scheduled time must be in the future";
  }
  if (target > now + ONE_YEAR_MS) {
    return "Scheduled time must be within the next 1 year";
  }
  return null;
}

export async function createPost(
  content: string,
  selectedAccountIds: string[],
  mode: PublishMode,
  scheduledAt: Date | null,
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
  queueSlotId?: string | null,
): Promise<CreatePostResult> {
  const ws = await requireWorkspaceSession("create_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;
  const actorUserId = ws.ctx.actorUserId;

  const normalizedScheduledAt = coerceDate(scheduledAt);

  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, error: "Post content is required" };
  }

  if (selectedAccountIds.length === 0) {
    return {
      success: false,
      error: "Select at least one account to publish to",
    };
  }

  if (
    !selectedAccountIds.every((id) => isValidUUID(id)) ||
    !mediaIds.every((id) => isValidUUID(id))
  ) {
    return {
      success: false,
      error: "Invalid ID format",
    };
  }

  if (mode === "scheduled") {
    const scheduleError = validateScheduledAtWindow(normalizedScheduledAt);
    if (scheduleError) {
      return { success: false, error: scheduleError };
    }
  }

  // Ensure selected accounts belong to the active workspace scope
  const ownedAccounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        connectionScopeCondition(ws.ctx),
        inArray(connectedAccounts.id, selectedAccountIds),
      ),
    );
  const ownedAccountIds = new Set(ownedAccounts.map((a) => a.id));
  const validSelectedIds = [...new Set(selectedAccountIds)];
  if (
    validSelectedIds.length !== ownedAccountIds.size ||
    !validSelectedIds.every((id) => ownedAccountIds.has(id))
  ) {
    return {
      success: false,
      error:
        "One or more selected accounts are invalid or do not belong to you",
    };
  }

  // Ensure all media IDs belong to the current user (when provided)
  if (mediaIds.length > 0) {
    const ownedMedia = await db
      .select({ id: mediaUploads.id })
      .from(mediaUploads)
      .where(
        and(
          eq(mediaUploads.userId, userId),
          inArray(mediaUploads.id, mediaIds),
        ),
      );
    const ownedMediaIds = new Set(ownedMedia.map((m) => m.id));
    if (!mediaIds.every((id) => ownedMediaIds.has(id))) {
      return {
        success: false,
        error: "One or more media files are invalid or do not belong to you",
      };
    }
  }

  // Charge one free post per "Publish now" / "Schedule" submission (drafts are free).
  if (mode !== "draft") {
    const quotaError = await gateFreePostQuota(userId);
    if (quotaError) {
      return { success: false, error: quotaError };
    }
  }

  const status = mode === "draft" ? "draft" : "scheduled";
  const resolvedScheduledAt =
    mode === "now"
      ? new Date()
      : mode === "scheduled"
        ? normalizedScheduledAt
        : null;

  try {
    const [postRow] = await db
      .insert(posts)
      .values({
        userId: userId,
        createdByUserId: actorUserId,
        workspaceId: ws.ctx.workspaceId,
        originalContent: trimmed,
        finalContent: trimmed,
        status,
        scheduledAt: resolvedScheduledAt,
        mediaIds: mediaIds.length > 0 ? mediaIds : [],
        metadata: metadata || null,
      })
      .returning({ id: posts.id });

    if (!postRow) {
      return { success: false, error: "Failed to create post" };
    }

    await db.insert(postPublications).values(
      validSelectedIds.map((connectedAccountId) => ({
        postId: postRow.id,
        connectedAccountId,
        status: "pending" as const,
      })),
    );

    if (mode !== "draft") {
      await incrementFreePostsUsed(userId);
    }

    if (mode === "now") {
      const skipPublish =
        metadata &&
        typeof metadata === "object" &&
        (metadata as Record<string, unknown>).__skipAutoPublish === true;

      if (!skipPublish) {
        const queued = await enqueuePublishPostStandalone({
          postId: postRow.id,
          userId: userId,
        });


        return {
          success: true,
          postId: postRow.id,
          queued: true,
          trackingId: queued.trackingId,
          streamUrl: queued.streamUrl,
        };
      }


      return {
        success: true,
        postId: postRow.id,
      };
    }

    if (mode === "scheduled" && normalizedScheduledAt && queueSlotId?.trim()) {
      const slotId = queueSlotId.trim();
      if (!(await userOwnsQueueSlot(userId, slotId))) {
        return { success: false, error: "Invalid queue slot" };
      }
      await db.insert(queuedPosts).values({
        userId: userId,
        postId: postRow.id,
        slotId,
        scheduledFor: normalizedScheduledAt,
        status: "pending",
      });
    }


    return { success: true, postId: postRow.id };
  } catch (e) {
    console.error("createPost error:", e);
    // Surface actionable enqueue/config errors; keep internals generic.
    const message = e instanceof Error ? e.message : "";
    if (
      message &&
      /CF publish|Cloudflare|No publication targets|not configured|BullMQ|redis/i.test(
        message,
      )
    ) {
      return { success: false, error: message };
    }
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export type DeletePostResult =
  | { success: true }
  | { success: false; error: string };

export async function deletePost(postId: string): Promise<DeletePostResult> {
  const ws = await requireWorkspaceSession("delete_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;

  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }

  try {
    const [post] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));
    if (!post) {
      return { success: false, error: "Post not found" };
    }

    await db
      .delete(postPublications)
      .where(eq(postPublications.postId, postId));
    await db.delete(posts).where(eq(posts.id, postId));

    return { success: true };
  } catch (e) {
    console.error("deletePost error:", e);
    return {
      success: false,
      error: "Failed to delete post. Please try again.",
    };
  }
}

/**
 * Clone a posted or partially posted post and publish it again (same content, same accounts).
 * Returns the new post id on success.
 */
export async function postAgain(postId: string): Promise<PostAgainResult> {
  const ws = await requireWorkspaceSession("create_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;
  const actorUserId = ws.ctx.actorUserId;
  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }

  const [post] = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      originalContent: posts.originalContent,
      finalContent: posts.finalContent,
      mediaIds: posts.mediaIds,
      metadata: posts.metadata,
      status: posts.status,
    })
    .from(posts)
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)))
    .limit(1);

  if (!post) {
    return { success: false, error: "Post not found" };
  }

  if (post.status !== "published" && post.status !== "partial") {
    return {
      success: false,
      error: "Only posted or partially posted posts can be posted again",
    };
  }

  const publications = await db
    .select({ connectedAccountId: postPublications.connectedAccountId })
    .from(postPublications)
    .where(eq(postPublications.postId, postId));

  const accountIds = [
    ...new Set(
      publications
        .map((p) => p.connectedAccountId)
        .filter((id): id is string => id != null),
    ),
  ];
  if (accountIds.length === 0) {
    return { success: false, error: "No accounts to post to" };
  }

  const ownedAccounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        connectionScopeCondition(ws.ctx),
        inArray(connectedAccounts.id, accountIds),
      ),
    );
  const ownedIds = new Set(ownedAccounts.map((a) => a.id));
  const validAccountIds = accountIds.filter((id) => ownedIds.has(id));
  if (validAccountIds.length === 0) {
    return { success: false, error: "No valid accounts to post to" };
  }

  const mediaIds = post.mediaIds ?? [];

  // "Post again" publishes a brand-new post - costs one free post.
  const quotaError = await gateFreePostQuota(userId, postId);
  if (quotaError) {
    return { success: false, error: quotaError };
  }

  try {
    const [newPost] = await db
      .insert(posts)
      .values({
        userId: userId,
        createdByUserId: actorUserId,
        workspaceId: ws.ctx.workspaceId,
        originalContent: post.originalContent,
        finalContent: post.finalContent,
        status: "scheduled",
        scheduledAt: new Date(),
        mediaIds: mediaIds.length > 0 ? mediaIds : [],
        metadata: post.metadata ?? undefined,
      })
      .returning({ id: posts.id });

    if (!newPost) {
      return { success: false, error: "Failed to create post" };
    }

    await db.insert(postPublications).values(
      validAccountIds.map((connectedAccountId) => ({
        postId: newPost.id,
        connectedAccountId,
        status: "pending" as const,
      })),
    );

    await incrementFreePostsUsed(userId);

    const queued = await enqueuePublishPostStandalone({
      postId: newPost.id,
      userId: userId,
    });


    return {
      success: true,
      newPostId: newPost.id,
      queued: true,
      trackingId: queued.trackingId,
      streamUrl: queued.streamUrl,
    };
  } catch (e) {
    console.error("postAgain error:", e);
    return {
      success: false,
      error: "Failed to post again. Please try again.",
    };
  }
}

export type UpdatePostResult =
  | { success: true }
  | { success: false; error: string };

export async function updatePost(
  postId: string,
  content: string,
  selectedAccountIds: string[],
  scheduledAt: Date | null,
  mediaIds?: string[],
  metadata?: Record<string, unknown>,
  queueSlotId?: string | null,
): Promise<UpdatePostResult> {
  const ws = await requireWorkspaceSession("edit_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;

  const normalizedScheduledAt = coerceDate(scheduledAt);

  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, error: "Post content is required" };
  }

  if (selectedAccountIds.length === 0) {
    return {
      success: false,
      error: "Select at least one account",
    };
  }

  if (
    !isValidUUID(postId) ||
    !selectedAccountIds.every((id) => isValidUUID(id))
  ) {
    return { success: false, error: "Invalid ID format" };
  }

  const finalMediaIds = mediaIds ?? [];
  if (
    finalMediaIds.length > 0 &&
    !finalMediaIds.every((id) => isValidUUID(id))
  ) {
    return { success: false, error: "Invalid media ID format" };
  }

  const ownedAccounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        connectionScopeCondition(ws.ctx),
        inArray(connectedAccounts.id, selectedAccountIds),
      ),
    );
  const ownedIds = new Set(ownedAccounts.map((a) => a.id));
  const validIds = [...new Set(selectedAccountIds)];
  if (
    validIds.length !== ownedIds.size ||
    !validIds.every((id) => ownedIds.has(id))
  ) {
    return {
      success: false,
      error: "One or more selected accounts are invalid",
    };
  }
  if (normalizedScheduledAt) {
    const scheduleError = validateScheduledAtWindow(normalizedScheduledAt);
    if (scheduleError) {
      return { success: false, error: scheduleError };
    }
  }

  try {
    const [existing] = await db
      .select({ id: posts.id, status: posts.status, mediaIds: posts.mediaIds })
      .from(posts)
      .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));
    if (!existing) {
      return { success: false, error: "Post not found" };
    }
    if (existing.status !== "draft" && existing.status !== "scheduled") {
      return {
        success: false,
        error: "Only drafts and scheduled posts can be edited",
      };
    }

    // Scheduling a draft is a "Schedule" submission - costs one free post.
    // Rescheduling an already-scheduled post (already charged) is free.
    const chargesQuota = !!normalizedScheduledAt && existing.status === "draft";
    if (chargesQuota) {
      const quotaError = await gateFreePostQuota(userId, postId);
      if (quotaError) {
        return { success: false, error: quotaError };
      }
    }

    if (finalMediaIds.length > 0) {
      const ownedMedia = await db
        .select({ id: mediaUploads.id })
        .from(mediaUploads)
        .where(
          and(
            eq(mediaUploads.userId, userId),
            inArray(mediaUploads.id, finalMediaIds),
          ),
        );
      const ownedMediaIds = new Set(ownedMedia.map((m) => m.id));
      if (!finalMediaIds.every((id) => ownedMediaIds.has(id))) {
        return { success: false, error: "One or more media files are invalid" };
      }
    }

    const oldMediaIds = (existing.mediaIds ?? []) as string[];
    const status = normalizedScheduledAt ? "scheduled" : "draft";
    await db
      .update(posts)
      .set({
        originalContent: trimmed,
        finalContent: trimmed,
        status,
        scheduledAt: normalizedScheduledAt,
        mediaIds: finalMediaIds,
        ...(metadata != null && { metadata }),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    const removedMediaIds = oldMediaIds.filter(
      (id) => !finalMediaIds.includes(id),
    );
    if (removedMediaIds.length > 0) {
      await db
        .delete(mediaUploads)
        .where(
          and(
            eq(mediaUploads.userId, userId),
            inArray(mediaUploads.id, removedMediaIds),
          ),
        );
    }

    await db
      .delete(postPublications)
      .where(eq(postPublications.postId, postId));
    await db.insert(postPublications).values(
      validIds.map((connectedAccountId) => ({
        postId,
        connectedAccountId,
        status: "pending" as const,
      })),
    );

    if (normalizedScheduledAt && queueSlotId?.trim()) {
      const slotId = queueSlotId.trim();
      if (!(await userOwnsQueueSlot(userId, slotId))) {
        return { success: false, error: "Invalid queue slot" };
      }
      await db
        .delete(queuedPosts)
        .where(
          and(
            eq(queuedPosts.postId, postId),
            eq(queuedPosts.userId, userId),
          ),
        );
      await db.insert(queuedPosts).values({
        userId: userId,
        postId,
        slotId,
        scheduledFor: normalizedScheduledAt,
        status: "pending",
      });
    } else if (!normalizedScheduledAt) {
      await db
        .delete(queuedPosts)
        .where(
          and(
            eq(queuedPosts.postId, postId),
            eq(queuedPosts.userId, userId),
          ),
        );
    }

    if (chargesQuota) {
      await incrementFreePostsUsed(userId);
    }

    return { success: true };
  } catch (e) {
    console.error("updatePost error:", e);
    return {
      success: false,
      error: "Failed to update post. Please try again.",
    };
  }
}

/**
 * Persist Auto-Plug / Auto-Repost for a scheduled post via `metadata.bulkAutoFeatures`
 * (queue-slot posts still use `posts.status === "scheduled"` - there is no separate `queued` status).
 * Consumed at publish time by executePublish.
 */
export async function updateScheduledPostAutoFeatures(
  postId: string,
  opts: {
    autoPlugConfig: AutoPlugConfig | null;
    resurfaceConfig: AutoResurfaceConfig | null;
  },
): Promise<UpdatePostResult> {
  const ws = await requireWorkspaceSession("edit_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;
  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }

  try {
    const [row] = await db
      .select({ id: posts.id, metadata: posts.metadata, status: posts.status })
      .from(posts)
      .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));

    if (!row) {
      return { success: false, error: "Post not found" };
    }
    if (row.status !== "scheduled") {
      return {
        success: false,
        error: "Auto features can only be edited on scheduled posts",
      };
    }

    const pubs = await db
      .select({ platform: connectedAccounts.platform })
      .from(postPublications)
      .innerJoin(
        connectedAccounts,
        eq(postPublications.connectedAccountId, connectedAccounts.id),
      )
      .where(eq(postPublications.postId, postId));

    const hasTwitterXSelected = pubs.some((p) => p.platform === "twitter_x");

    const metadata = {
      ...((row.metadata as Record<string, unknown> | null) ?? {}),
    };
    applyBulkAutoFeaturesToScheduledMetadata(metadata, {
      hasTwitterXSelected,
      resurfaceConfig: opts.resurfaceConfig,
      autoPlugConfig: opts.autoPlugConfig,
    });

    await db
      .update(posts)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(posts.id, postId));

    return { success: true };
  } catch (e) {
    console.error("updateScheduledPostAutoFeatures error:", e);
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to update scheduled auto features",
    };
  }
}

export type GetDraftResult =
  | {
      success: true;
      draft: {
        id: string;
        originalContent: string | null;
        scheduledAt: Date | null;
        connectedAccountIds: string[];
        media: PostMediaRow[];
        metadata: Record<string, unknown> | null;
      };
    }
  | { success: false; error: string };

export async function getDraft(postId: string): Promise<GetDraftResult> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;
  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }
  const post = await getPostForEdit(postId, userId, ws.ctx.workspaceId);
  if (!post) {
    return { success: false, error: "Draft not found" };
  }
  if (post.status !== "draft") {
    return { success: false, error: "Post is not a draft" };
  }
  const mediaIds = post.mediaIds ?? [];
  const media =
    mediaIds.length > 0 ? await getPostMedia(userId, mediaIds) : [];
  const [row] = await db
    .select({ metadata: posts.metadata })
    .from(posts)
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));
  return {
    success: true,
    draft: {
      id: post.id,
      originalContent: post.originalContent,
      scheduledAt: post.scheduledAt,
      connectedAccountIds: post.connectedAccountIds,
      media,
      metadata: (row?.metadata as Record<string, unknown>) ?? null,
    },
  };
}

export type GetScheduledPostResult =
  | {
      success: true;
      post: {
        id: string;
        originalContent: string | null;
        scheduledAt: Date | null;
        connectedAccountIds: string[];
        media: PostMediaRow[];
        metadata: Record<string, unknown> | null;
        /** When post is in the queue, pass to updatePost to preserve the link */
        queueSlotId: string | null;
      };
    }
  | { success: false; error: string };

/** Load a scheduled (or draft) post for editing in the composer. Use for ?scheduled=[id]. */
export async function getScheduledPost(
  postId: string,
): Promise<GetScheduledPostResult> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;
  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }
  const post = await getPostForEdit(postId, userId, ws.ctx.workspaceId);
  if (!post) {
    return { success: false, error: "Post not found" };
  }
  if (post.status !== "scheduled" && post.status !== "draft") {
    return {
      success: false,
      error: "Only scheduled or draft posts can be edited",
    };
  }
  const mediaIds = post.mediaIds ?? [];
  const media =
    mediaIds.length > 0 ? await getPostMedia(userId, mediaIds) : [];
  const [row] = await db
    .select({ metadata: posts.metadata })
    .from(posts)
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));
  let queueSlotId: string | null = null;
  if (post.status === "scheduled") {
    const slot = await getQueuedSlotForPost(postId, userId);
    if (slot) queueSlotId = slot.slotId;
  }
  return {
    success: true,
    post: {
      id: post.id,
      originalContent: post.originalContent,
      scheduledAt: post.scheduledAt,
      connectedAccountIds: post.connectedAccountIds,
      media,
      metadata: (row?.metadata as Record<string, unknown>) ?? null,
      queueSlotId,
    },
  };
}

/** Same shape as GetScheduledPostResult for loading a posted/partial/failed post to edit and re-publish. */
export type GetPostToEditResult =
  | {
      success: true;
      post: {
        id: string;
        originalContent: string | null;
        scheduledAt: Date | null;
        connectedAccountIds: string[];
        media: PostMediaRow[];
        metadata: Record<string, unknown> | null;
        queueSlotId: string | null;
      };
    }
  | { success: false; error: string };

/** Load a published, partial, or failed post for editing in the composer. Use for ?edit=[id]. */
export async function getPostToEdit(
  postId: string,
): Promise<GetPostToEditResult> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;
  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }
  const post = await getPostForEdit(postId, userId, ws.ctx.workspaceId);
  if (!post) {
    return { success: false, error: "Post not found" };
  }
  const allowed = ["published", "partial", "failed"].includes(
    post.status ?? "",
  );
  if (!allowed) {
    return {
      success: false,
      error:
        "Only posted, partial, or failed posts can be edited for republish",
    };
  }
  const mediaIds = post.mediaIds ?? [];
  const media =
    mediaIds.length > 0 ? await getPostMedia(userId, mediaIds) : [];
  const [row] = await db
    .select({ metadata: posts.metadata })
    .from(posts)
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));
  return {
    success: true,
    post: {
      id: post.id,
      originalContent: post.originalContent,
      scheduledAt: post.scheduledAt,
      connectedAccountIds: post.connectedAccountIds,
      media,
      metadata: (row?.metadata as Record<string, unknown>) ?? null,
      queueSlotId: null,
    },
  };
}

export type DeleteDraftResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteDraft(postId: string): Promise<DeleteDraftResult> {
  const ws = await requireWorkspaceSession("delete_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;
  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }
  try {
    const [post] = await db
      .select({ id: posts.id, status: posts.status })
      .from(posts)
      .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));
    if (!post) {
      return { success: false, error: "Post not found" };
    }
    if (post.status !== "draft") {
      return { success: false, error: "Only drafts can be deleted" };
    }
    await db
      .delete(postPublications)
      .where(eq(postPublications.postId, postId));
    await db.delete(posts).where(eq(posts.id, postId));
    return { success: true };
  } catch (e) {
    console.error("deleteDraft error:", e);
    return {
      success: false,
      error: "Failed to delete draft. Please try again.",
    };
  }
}

/** Save draft changes (content, accounts, media). Keeps status as draft. */
export async function updateDraft(
  draftId: string,
  content: string,
  selectedAccountIds: string[],
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
): Promise<UpdatePostResult> {
  return updatePost(
    draftId,
    content,
    selectedAccountIds,
    null,
    mediaIds.length > 0 ? mediaIds : undefined,
    metadata,
  );
}

export type UpdateAndPublishResult =
  | {
      success: true;
      postId: string;
      allPlatformsFailed?: boolean;
      queued?: boolean;
      trackingId?: string;
      streamUrl?: string;
    }
  | { success: false; error: string };

/** Update draft content/accounts/media then publish now. */
export async function updateAndPublish(
  draftId: string,
  content: string,
  selectedAccountIds: string[],
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
): Promise<UpdateAndPublishResult> {
  const ws = await requireWorkspaceSession("create_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;
  // Pass null for scheduledAt: we are publishing now, not scheduling. Using `new Date()`
  // caused flaky failures - the client timestamp can be slightly in the past relative to
  // the server when validateScheduledAtWindow runs after network latency.
  const result = await updatePost(
    draftId,
    content,
    selectedAccountIds,
    null,
    mediaIds.length > 0 ? mediaIds : undefined,
    metadata,
  );
  if (!result.success) {
    return result;
  }

  // Publishing a draft now is a "Publish now" submission - costs one free post.
  // (The updatePost call above ran with scheduledAt=null, so it charged nothing.)
  const quotaError = await gateFreePostQuota(userId, draftId);
  if (quotaError) {
    return { success: false, error: quotaError };
  }
  await incrementFreePostsUsed(userId);

  try {
    const queued = await enqueuePublishPostStandalone({
      postId: draftId,
      userId: userId,
    });
    return {
      success: true,
      postId: draftId,
      queued: true,
      trackingId: queued.trackingId,
      streamUrl: queued.streamUrl,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Publish failed after update",
    };
  }
}

export async function loadEditPostPageData(postId: string): Promise<
  | {
      ok: true;
      post: NonNullable<Awaited<ReturnType<typeof getPostForEdit>>>;
      existingMedia: PostMediaRow[];
      use24HourTimeFormat: boolean;
      dateFormat: string | null;
    }
  | { ok: false; error: string }
> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return { ok: false, error: ws.error };
  const userId = ws.ctx.resourceUserId;
  if (!isValidUUID(postId)) return { ok: false, error: "Invalid post ID" };

  const post = await getPostForEdit(postId, userId, ws.ctx.workspaceId);
  if (!post) return { ok: false, error: "Post not found" };
  if (post.status !== "draft" && post.status !== "scheduled") {
    return { ok: false, error: "Post cannot be edited" };
  }

  const existingMedia =
    post.mediaIds && post.mediaIds.length > 0
      ? await getPostMedia(userId, post.mediaIds)
      : [];

  const { use24HourTimeFormat, dateFormat } = await getUserSettingsSnapshot();

  return {
    ok: true,
    post,
    existingMedia,
    use24HourTimeFormat,
    dateFormat,
  };
}
