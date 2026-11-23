
import { db } from "@/db";
import { coerceDate } from "@/lib/coerce-date.js";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
  queuedPosts,
} from "@/db/schema";
import { eq, inArray, and, ne, or, arrayOverlaps, sql } from "drizzle-orm";
import {
  idlePublicationSqlFor,
  postPublishingStaleSql,
} from "@/lib/stuck-publishing";
import {
  requireWorkspaceSession,
  type WorkspaceSession,
} from "@/lib/workspace/session";
import {
  connectionScopeCondition,
  postScopeCondition,
  type WorkspaceContext,
} from "@/lib/workspace/context";
import {
  createPublishTrackingId,
  enqueuePublishPostStandalone,
} from "./enqueue.js";
import { PublishNotDispatchedError } from "./publish-enqueue.js";
import { userOwnsQueueSlot } from "@/lib/queue-slot-validation";
import {
  getPostForEdit,
  getPostMedia,
  getQueuedSlotForPost,
  type PostMediaRow,
} from "@/lib/posts-list/posts-list-data";
import { isValidUUID } from "@/lib/validation";
import { getUserSettingsSnapshot } from "@/services/settings";
import { applyBulkAutoFeaturesToScheduledMetadata } from "@/lib/bulk-auto-features-metadata";
import { sanitizePostMetadata } from "@/lib/post-metadata-sanitize";
import {
  checkSelectedAccounts,
  SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR,
  type SelectedAccountsCheck,
} from "@/lib/post-account-refs";
import {
  checkPostMediaOwnership,
  collectPostMediaIds,
  validatePostMediaCounts,
} from "@/lib/post-media-refs";
import { carryPostSource, withPostSource } from "@/lib/post-source";
import {
  releaseFreePost,
  reserveFreePost,
  type FreePostReservation,
} from "@/lib/plan-limits";
import { logPublishBlocked } from "@social0/shared";
import {
  emitPostDeletedWebhook,
  emitPostScheduledWebhook,
} from "@/lib/post-lifecycle-webhooks";
import type {
  AutoPlugConfig,
  AutoResurfaceConfig,
} from "@/lib/auto-features-types";

/**
 * Free-tier quota: exactly one free post is consumed when the user hits
 * "Publish now" or "Schedule" (the submission actions below). The publish
 * pipeline itself never counts - it may run many times per post (per-platform
 * progress, safety-net republish, retries, cron).
 *
 * Reserving (an atomic conditional increment) rather than check-then-increment
 * is what makes the limit hold: two racing submissions used to both pass the
 * read and both publish. Callers must release the reservation if they bail out
 * before the post is actually created.
 */
export async function reserveFreePostQuota(
  userId: string,
  postId?: string,
): Promise<
  { ok: true; reservation: FreePostReservation } | { ok: false; error: string }
> {
  const reservation = await reserveFreePost(userId);
  if (reservation.allowed) return { ok: true, reservation };
  logPublishBlocked("free_post_limit", userId, postId, {
    used: reservation.used,
    limit: reservation.limit,
  });
  return {
    ok: false,
    error:
      reservation.reason ??
      "You've used your free posts. Upgrade to continue posting.",
  };
}

export type PostAgainResult =
  | {
      success: true;
      newPostId: string;
      queued?: boolean;
      trackingId?: string;
      streamUrl?: string;
      /** The post is publishing, but not everything went as planned. */
      warning?: string;
    }
  | {
      success: false;
      error: string;
      /** Set when the new post was saved but could not be published. */
      postId?: string;
    };

export type CreatePostResult =
  | {
      success: true;
      postId: string;
      allPlatformsFailed?: boolean;
      queued?: boolean;
      trackingId?: string;
      streamUrl?: string;
      /** The post is publishing, but not everything went as planned. */
      warning?: string;
    }
  | {
      success: false;
      error: string;
      /**
       * Set when the post was saved but could not be published: link to it
       * rather than offering a fresh submit.
       */
      postId?: string;
    };

export type PublishMode = "draft" | "now" | "scheduled";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Allow a few minutes of client/server clock skew and network delay (was causing false failures). */
const SCHEDULE_FUTURE_GRACE_MS = 120_000;

/** Surface actionable Error messages; hide SQL/stack/internals. */
function toSafeClientError(e: unknown, fallback: string): string {
  const message = e instanceof Error ? e.message.trim() : "";
  if (!message) return fallback;
  if (message.length > 280) return fallback;
  if (
    /stack|at\s+\S+\s+\(|sqlstate|drizzle|postgres|neon\.tech|ECONNREFUSED|ENOENT|internal server/i.test(
      message,
    )
  ) {
    return fallback;
  }
  return message;
}

/**
 * Selected account ids that exist in `ctx`'s scope and are within the plan's
 * connected-account cap (see lib/post-account-refs.ts).
 */
async function checkAccountsInScope(
  ctx: WorkspaceContext,
  accountIds: string[],
): Promise<SelectedAccountsCheck> {
  if (accountIds.length === 0) return { ok: false, reason: "not_found" };
  const rows = await db
    .select({ id: connectedAccounts.id, isActive: connectedAccounts.isActive })
    .from(connectedAccounts)
    .where(
      and(
        connectionScopeCondition(ctx),
        inArray(connectedAccounts.id, accountIds),
      ),
    );
  return checkSelectedAccounts(accountIds, rows);
}

export const PARTIAL_FAN_OUT_WARNING =
  "Some accounts couldn't be queued. They're marked failed on the post, so retry them from there.";
export const PUBLISH_DELAYED_WARNING =
  "Publishing is delayed. The post is queued and will go out in a few minutes.";

/**
 * Publish a post created (with its publications) as `scheduled` at the
 * current time — "Publish now" and "Post again".
 *
 * Once that row is committed, an enqueue error must not read as "nothing
 * happened". Part of the fan-out may already be out (a server-side X/TikTok
 * job starts before the next platform's CF enqueue), or the dispatch never
 * touched the post and the scheduled cron will publish it on its next tick.
 * Reporting failure in either case sent the user to resubmit, which created a
 * second post and published it again to the accounts the first one reached.
 *
 * Only a publish that sent nothing and left the post `failed` (or a draft)
 * is a failure; the caller returns the post id with it so the UI can link to
 * that post instead of offering a fresh submit.
 */
export async function enqueueCommittedPost(
  postId: string,
  userId: string,
): Promise<
  | { ok: true; trackingId?: string; streamUrl?: string; warning?: string }
  | { ok: false; error: string }
> {
  const trackingId = createPublishTrackingId();
  try {
    const queued = await enqueuePublishPostStandalone(
      { postId, userId },
      { trackingId },
    );
    return { ok: true, trackingId: queued.trackingId, streamUrl: queued.streamUrl };
  } catch (e) {
    console.error("publish enqueue error:", e);
    if (e instanceof PublishNotDispatchedError) {
      if (e.postStatus === "failed" || e.postStatus === "draft") {
        return {
          ok: false,
          error: toSafeClientError(
            e,
            "Couldn't reach the publishing service. Please try again.",
          ),
        };
      }
      // `unchanged` / `scheduled`: still a past-due scheduled post the cron
      // claims. `null`: something else already moved it; it may be publishing.
      return { ok: true, warning: PUBLISH_DELAYED_WARNING };
    }
    // Part of the fan-out went out. The rest are failed (retryable per
    // publication) and the post stays `publishing`: follow the existing job.
    return {
      ok: true,
      trackingId,
      streamUrl: `/api/jobs/${trackingId}/stream`,
      warning: PARTIAL_FAN_OUT_WARNING,
    };
  }
}

/** RPC/JSON may pass ISO strings instead of Date instances. */
export function validateScheduledAtWindow(scheduledAt: unknown): string | null {
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

  // Ensure selected accounts belong to the active workspace scope and are
  // within the plan's connected-account cap.
  const validSelectedIds = [...new Set(selectedAccountIds)];
  const accountCheck = await checkAccountsInScope(ws.ctx, validSelectedIds);
  if (!accountCheck.ok) {
    return {
      success: false,
      error:
        accountCheck.reason === "over_limit"
          ? SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR
          : "One or more selected accounts are invalid or do not belong to you",
    };
  }

  // Same ceiling the publish engine applies, so an oversized post fails here
  // on save instead of at publish time after it was scheduled and charged.
  const mediaCountError = validatePostMediaCounts(mediaIds, metadata);
  if (mediaCountError) {
    return { success: false, error: mediaCountError };
  }

  // Every media reference (top level, thread parts, accountMedia) must be one
  // of the user's uploads: the publish engine reads all three.
  const mediaCheck = await checkPostMediaOwnership(userId, mediaIds, metadata);
  if (!mediaCheck.ok) {
    return {
      success: false,
      error:
        mediaCheck.reason === "invalid_format"
          ? "Invalid ID format"
          : "One or more media files are invalid or do not belong to you",
    };
  }

  // RPC input is unvalidated: anything but a non-empty string means "no slot".
  const slotId =
    mode === "scheduled" && normalizedScheduledAt && typeof queueSlotId === "string"
      ? queueSlotId.trim() || null
      : null;
  if (slotId && (!isValidUUID(slotId) || !(await userOwnsQueueSlot(userId, slotId)))) {
    return { success: false, error: "Invalid queue slot" };
  }

  // Charge one free post per "Publish now" / "Schedule" submission (drafts are free).
  let reservation: FreePostReservation | null = null;
  if (mode !== "draft") {
    const quota = await reserveFreePostQuota(userId);
    if (!quota.ok) {
      return { success: false, error: quota.error };
    }
    reservation = quota.reservation;
  }

  // Release only while the submission has not landed yet. Once the post and
  // its publications exist the quota stays spent — this is the same point the
  // previous `incrementFreePostsUsed` call charged at, and refunding past it
  // would leave an unpaid post that `/api/publish` (which never charges) could
  // publish for free.
  const releaseQuota = async () => {
    if (!reservation) return;
    const held = reservation;
    reservation = null;
    await releaseFreePost(held, userId);
  };
  const commitQuota = () => {
    reservation = null;
  };

  const status = mode === "draft" ? "draft" : "scheduled";
  const resolvedScheduledAt =
    mode === "now"
      ? new Date()
      : mode === "scheduled"
        ? normalizedScheduledAt
        : null;

  try {
    // Post, publications and queue slot land together: a failure part-way
    // must not leave a live post behind an error the client will resubmit.
    const postRow = await db.transaction(async (tx) => {
      const [row] = await tx
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
          metadata: withPostSource(sanitizePostMetadata(metadata), {
            kind: "user",
          }),
        })
        .returning({ id: posts.id });
      if (!row) return null;

      await tx.insert(postPublications).values(
        validSelectedIds.map((connectedAccountId) => ({
          postId: row.id,
          connectedAccountId,
          status: "pending" as const,
        })),
      );

      if (slotId && normalizedScheduledAt) {
        await tx.insert(queuedPosts).values({
          userId: userId,
          postId: row.id,
          slotId,
          scheduledFor: normalizedScheduledAt,
          status: "pending",
        });
      }
      return row;
    });

    if (!postRow) {
      await releaseQuota();
      return { success: false, error: "Failed to create post" };
    }

    commitQuota();

    if (mode === "now") {
      // Always enqueue. The post is committed as a due `scheduled` row, so
      // leaving it for the client to publish inline would let the cron claim
      // it too (and publish it even when that client call is refused).
      // Publish-time options (TikTok photo auto-music) ride in metadata, which
      // every runner reads.
      const queued = await enqueueCommittedPost(postRow.id, userId);
      if (!queued.ok) {
        return { success: false, error: queued.error, postId: postRow.id };
      }
      return {
        success: true,
        postId: postRow.id,
        queued: true,
        trackingId: queued.trackingId,
        streamUrl: queued.streamUrl,
        ...(queued.warning && { warning: queued.warning }),
      };
    }

    if (mode === "scheduled" && normalizedScheduledAt) {
      emitPostScheduledWebhook(userId, postRow.id, normalizedScheduledAt);
    }

    return { success: true, postId: postRow.id };
  } catch (e) {
    await releaseQuota();
    console.error("createPost error:", e);
    return {
      success: false,
      error: toSafeClientError(
        e,
        "Couldn't create this post. Please try again.",
      ),
    };
  }
}

export type DeletePostResult =
  | { success: true }
  | { success: false; error: string };

/**
 * One of this post's deliveries is being published right now: a row in
 * `publishing` with a write inside the stuck window. A per-network Retry on a
 * `partial` post claims only that row and leaves the post `partial`, so the
 * post status alone does not show it. Idle rows belong to a dead run and do
 * not count, the same rule the publish engine uses to take them over.
 */
export const postDeliveryInFlightSql = sql<boolean>`exists (
  select 1 from ${postPublications} pp
  where pp.post_id = ${posts.id}
    and pp.status = 'publishing'
    and not ${idlePublicationSqlFor({
      updatedAt: sql`pp.updated_at`,
      createdAt: sql`pp.created_at`,
    })}
)`.mapWith(Boolean);

export async function deletePost(postId: string): Promise<DeletePostResult> {
  const ws = await requireWorkspaceSession("delete_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }

  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }

  try {
    // One transaction, and the post row locked first: a post that is
    // publishing right now (cron-claimed, or a publish-now in flight) must not
    // vanish under the job — its platform post would land with no record in
    // Social0 and a `post.deleted` webhook for a post that went out. A
    // `publishing` post past the stuck window is dead and may go. The lock
    // also makes a concurrent claim wait for this delete and then match
    // nothing, and a failure part-way leaves the post with its publications.
    // A Retry of one network on a `partial` post leaves the post `partial`
    // while it uploads, so a live delivery row refuses the delete too.
    const deleted = await db.transaction(async (tx) => {
      const [post] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(
            eq(posts.id, postId),
            postScopeCondition(ws.ctx),
            or(ne(posts.status, "publishing"), postPublishingStaleSql),
            sql`not ${postDeliveryInFlightSql}`,
          ),
        )
        .for("update");
      if (!post) return false;

      await tx
        .delete(postPublications)
        .where(eq(postPublications.postId, postId));
      await tx.delete(posts).where(eq(posts.id, postId));
      return true;
    });

    if (!deleted) {
      const [current] = await db
        .select({
          status: posts.status,
          deliveryInFlight: postDeliveryInFlightSql,
        })
        .from(posts)
        .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)))
        .limit(1);
      return {
        success: false,
        error:
          current?.status === "publishing" || current?.deliveryInFlight
            ? "This post is publishing right now, so it can't be deleted yet."
            : "Post not found",
      };
    }

    emitPostDeletedWebhook(ws.ctx.resourceUserId, postId);
    return { success: true };
  } catch (e) {
    console.error("deletePost error:", e);
    return {
      success: false,
      error: "Failed to delete post. Please try again.",
    };
  }
}

/** Most posts one bulk call handles; the dashboard sends bigger selections in chunks. */
export const POSTS_BATCH_MAX = 100;

export type PostsBatchResult = {
  ok: string[];
  failed: { id: string; error: string }[];
};

/** Throws a 400 (the RPC route sends `statusCode` 4xx as the error) on an empty or oversized batch. */
function assertBatchSize(items: unknown): void {
  if (Array.isArray(items) && items.length > 0 && items.length <= POSTS_BATCH_MAX) return;
  throw Object.assign(new Error(`Send between 1 and ${POSTS_BATCH_MAX} posts at a time.`), {
    statusCode: 400,
  });
}

/**
 * Delete many posts in one request, so a bulk delete costs one rate-limit
 * hit instead of one per post. Each post goes through `deletePost`, so the
 * publishing lock and webhooks are unchanged.
 */
export async function deletePosts(postIds: string[]): Promise<PostsBatchResult> {
  assertBatchSize(postIds);
  const out: PostsBatchResult = { ok: [], failed: [] };
  for (const id of new Set(postIds)) {
    // deletePost validates the id (non-strings fail as "Invalid post ID").
    const res = await deletePost(id);
    if (res.success) out.ok.push(id);
    else out.failed.push({ id: String(id), error: res.error });
  }
  return out;
}

export type DuplicatePostInput = {
  /** The post being copied; reported back in `ok` / `failed`. */
  sourceId: string;
  content: string;
  accountIds: string[];
  mediaIds?: string[];
  metadata?: Record<string, unknown>;
};

/** Copy many posts into drafts in one request. Each copy goes through `createPost`. */
export async function duplicatePosts(
  items: DuplicatePostInput[],
): Promise<PostsBatchResult & { createdIds: string[] }> {
  assertBatchSize(items);
  const out: PostsBatchResult & { createdIds: string[] } = { ok: [], failed: [], createdIds: [] };
  for (const item of items) {
    const sourceId = typeof item?.sourceId === "string" ? item.sourceId : "";
    if (!Array.isArray(item?.accountIds) || typeof item.content !== "string") {
      out.failed.push({ id: sourceId, error: "Invalid post" });
      continue;
    }
    const res = await createPost(
      item.content,
      item.accountIds,
      "draft",
      null,
      Array.isArray(item.mediaIds) ? item.mediaIds : [],
      item.metadata,
    );
    if (res.success) {
      out.ok.push(sourceId);
      out.createdIds.push(res.postId);
    } else {
      out.failed.push({ id: sourceId, error: res.error });
    }
  }
  return out;
}

/**
 * Clone a posted or partially posted post and publish it again (same content, same accounts).
 * Returns the new post id on success.
 */
export async function postAgain(postId: string): Promise<PostAgainResult> {
  return postAgainForScope(await requireWorkspaceSession("create_posts"), postId);
}

/** `postAgain` for an already-resolved scope (`/v1` passes its `workspace_id` context). */
export async function postAgainForScope(
  ws: WorkspaceSession,
  postId: string,
): Promise<PostAgainResult> {
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
      deliveryInFlight: postDeliveryInFlightSql,
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

  // A Retry of one network is still uploading (the post stays `partial`
  // meanwhile): posting again now would publish to that account twice.
  if (post.deliveryInFlight) {
    return {
      success: false,
      error: "This post is publishing right now, so it can't be posted again yet.",
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
    .select({ id: connectedAccounts.id, isActive: connectedAccounts.isActive })
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
  // Accounts disconnected since are skipped above; accounts the plan cap has
  // switched off are refused, as createPost does.
  const accountCheck = checkSelectedAccounts(validAccountIds, ownedAccounts);
  if (!accountCheck.ok) {
    return { success: false, error: SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR };
  }

  const mediaIds = post.mediaIds ?? [];

  // "Post again" publishes a brand-new post - costs one free post.
  const quota = await reserveFreePostQuota(userId, postId);
  if (!quota.ok) {
    return { success: false, error: quota.error };
  }
  let postAgainCommitted = false;

  try {
    // Post and publications land together, as in createPost: a post created
    // `scheduled` for now with no publications would be claimed by the cron
    // and show up as a phantom failed post.
    const newPost = await db.transaction(async (tx) => {
      const [row] = await tx
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
          // "Post again" is the person clicking it, whoever made the original.
          metadata: withPostSource(sanitizePostMetadata(post.metadata), {
            kind: "user",
          }),
        })
        .returning({ id: posts.id });
      if (!row) return null;

      await tx.insert(postPublications).values(
        validAccountIds.map((connectedAccountId) => ({
          postId: row.id,
          connectedAccountId,
          status: "pending" as const,
        })),
      );
      return row;
    });

    if (!newPost) {
      await releaseFreePost(quota.reservation, userId);
      return { success: false, error: "Failed to create post" };
    }

    // Submission has landed — see createPost for why the refund stops here.
    postAgainCommitted = true;

    const queued = await enqueueCommittedPost(newPost.id, userId);
    if (!queued.ok) {
      return { success: false, error: queued.error, postId: newPost.id };
    }
    return {
      success: true,
      newPostId: newPost.id,
      queued: true,
      trackingId: queued.trackingId,
      streamUrl: queued.streamUrl,
      ...(queued.warning && { warning: queued.warning }),
    };
  } catch (e) {
    if (!postAgainCommitted) {
      await releaseFreePost(quota.reservation, userId);
    }
    console.error("postAgain error:", e);
    return {
      success: false,
      error: toSafeClientError(e, "Couldn't post again. Please try again."),
    };
  }
}

/**
 * Which of `candidateIds` another of the user's posts still references, in its
 * `media_ids`, a thread part's `metadata.twitterThread.parts[].mediaIds` or
 * its `metadata.accountMedia` (see lib/post-media-refs.ts).
 */
async function mediaIdsUsedByOtherPosts(
  userId: string,
  postId: string,
  candidateIds: string[],
): Promise<Set<string>> {
  const rows = await db
    .select({ mediaIds: posts.mediaIds, metadata: posts.metadata })
    .from(posts)
    .where(
      and(
        eq(posts.userId, userId),
        ne(posts.id, postId),
        or(
          arrayOverlaps(posts.mediaIds, candidateIds),
          sql`${posts.metadata} -> 'twitterThread' -> 'parts' is not null`,
          sql`${posts.metadata} -> 'accountMedia' is not null`,
        ),
      ),
    );
  const candidates = new Set(candidateIds);
  const used = new Set<string>();
  for (const row of rows) {
    for (const id of collectPostMediaIds(row.mediaIds, row.metadata)) {
      if (candidates.has(id)) used.add(id);
    }
  }
  return used;
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
  const result = await updatePostInScope(ws.ctx, {
    postId,
    content,
    selectedAccountIds,
    scheduledAt,
    mediaIds,
    metadata,
    queueSlotId,
    publishNow: false,
  });
  return result.success ? { success: true } : result;
}

/**
 * Shared body of updatePost / updateAndPublish. Every check (accounts, media,
 * queue slot, free-post quota) runs before anything is written, and the post,
 * publication and queue-slot writes commit together, so a failure leaves the
 * post exactly as it was.
 *
 * `publishNow`: the caller enqueues a publish right after. Publishing a draft
 * costs one free post; a scheduled post was charged when it was scheduled.
 *
 * On success, `reservation` is the free post this edit charged (null when it
 * charged nothing), for a caller whose follow-up turns out not to happen.
 */
async function updatePostInScope(
  ctx: WorkspaceContext,
  input: {
    postId: string;
    content: string;
    selectedAccountIds: string[];
    scheduledAt: Date | null;
    mediaIds?: string[];
    metadata?: Record<string, unknown>;
    queueSlotId?: string | null;
    publishNow: boolean;
  },
): Promise<
  | { success: true; reservation: FreePostReservation | null }
  | { success: false; error: string }
> {
  const { postId, selectedAccountIds, metadata, publishNow } = input;
  const userId = ctx.resourceUserId;

  const normalizedScheduledAt = publishNow ? null : coerceDate(input.scheduledAt);

  const trimmed = input.content.trim();
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

  const finalMediaIds = input.mediaIds ?? [];
  if (
    finalMediaIds.length > 0 &&
    !finalMediaIds.every((id) => isValidUUID(id))
  ) {
    return { success: false, error: "Invalid media ID format" };
  }

  // RPC input is unvalidated: anything but a non-empty string means "no slot".
  const slotId =
    normalizedScheduledAt && typeof input.queueSlotId === "string"
      ? input.queueSlotId.trim() || null
      : null;

  const validIds = [...new Set(selectedAccountIds)];
  const accountCheck = await checkAccountsInScope(ctx, validIds);
  if (!accountCheck.ok) {
    return {
      success: false,
      error:
        accountCheck.reason === "over_limit"
          ? SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR
          : "One or more selected accounts are invalid",
    };
  }
  if (normalizedScheduledAt) {
    const scheduleError = validateScheduledAtWindow(normalizedScheduledAt);
    if (scheduleError) {
      return { success: false, error: scheduleError };
    }
  }

  let reservation: FreePostReservation | null = null;
  const releaseQuota = async () => {
    if (reservation) {
      await releaseFreePost(reservation, userId);
      reservation = null;
    }
  };

  try {
    const [existing] = await db
      .select({
        id: posts.id,
        status: posts.status,
        mediaIds: posts.mediaIds,
        metadata: posts.metadata,
      })
      .from(posts)
      .where(and(eq(posts.id, postId), postScopeCondition(ctx)));
    if (!existing) {
      return { success: false, error: "Post not found" };
    }
    if (existing.status !== "draft" && existing.status !== "scheduled") {
      return {
        success: false,
        error: "Only drafts and scheduled posts can be edited",
      };
    }

    // Same ceiling the publish engine applies, checked against the metadata
    // the post will have after this edit.
    const mediaCountError = validatePostMediaCounts(
      finalMediaIds,
      metadata ??
        (existing.metadata && typeof existing.metadata === "object"
          ? (existing.metadata as Record<string, unknown>)
          : null),
    );
    if (mediaCountError) {
      return { success: false, error: mediaCountError };
    }

    // Top-level media and, when the composer sends new metadata, the ids in
    // its thread parts and accountMedia: the publish engine reads all three.
    const mediaCheck = await checkPostMediaOwnership(
      userId,
      finalMediaIds,
      metadata,
    );
    if (!mediaCheck.ok) {
      return {
        success: false,
        error:
          mediaCheck.reason === "invalid_format"
            ? "Invalid media ID format"
            : "One or more media files are invalid",
      };
    }

    if (slotId && (!isValidUUID(slotId) || !(await userOwnsQueueSlot(userId, slotId)))) {
      return { success: false, error: "Invalid queue slot" };
    }

    // Scheduling or publishing a draft is a submission - costs one free post.
    // A scheduled post was charged when it was scheduled, so rescheduling it
    // or publishing it now is free.
    const chargesQuota =
      existing.status === "draft" && (publishNow || !!normalizedScheduledAt);
    if (chargesQuota) {
      const quota = await reserveFreePostQuota(userId, postId);
      if (!quota.ok) {
        return { success: false, error: quota.error };
      }
      reservation = quota.reservation;
    }

    const oldMediaIds = (existing.mediaIds ?? []) as string[];
    const status = normalizedScheduledAt ? "scheduled" : "draft";
    const updated = await db.transaction(async (tx) => {
      // Conditional on the status read above, so a scheduled post the cron
      // has just claimed (now `publishing`) is not rewritten under it.
      const [row] = await tx
        .update(posts)
        .set({
          originalContent: trimmed,
          finalContent: trimmed,
          status,
          scheduledAt: normalizedScheduledAt,
          mediaIds: finalMediaIds,
          // Composer metadata replaces the column, but `source` is server-owned:
          // keep whatever creation stamped (an approved agent draft stays an
          // agent post).
          ...(metadata != null && {
            metadata: carryPostSource(
              sanitizePostMetadata(metadata),
              existing.metadata,
            ),
          }),
          updatedAt: new Date(),
        })
        .where(and(eq(posts.id, postId), eq(posts.status, existing.status!)))
        .returning({ id: posts.id });
      if (!row) return false;

      await tx
        .delete(postPublications)
        .where(eq(postPublications.postId, postId));
      await tx.insert(postPublications).values(
        validIds.map((connectedAccountId) => ({
          postId,
          connectedAccountId,
          status: "pending" as const,
        })),
      );

      // A new time without a slot (custom time, or no longer scheduled)
      // releases any pending slot link, as reschedulePost does.
      if (slotId || !normalizedScheduledAt) {
        await tx
          .delete(queuedPosts)
          .where(
            and(
              eq(queuedPosts.postId, postId),
              eq(queuedPosts.userId, userId),
            ),
          );
      } else {
        await tx
          .delete(queuedPosts)
          .where(
            and(
              eq(queuedPosts.postId, postId),
              eq(queuedPosts.userId, userId),
              eq(queuedPosts.status, "pending"),
            ),
          );
      }
      if (slotId && normalizedScheduledAt) {
        await tx.insert(queuedPosts).values({
          userId: userId,
          postId,
          slotId,
          scheduledFor: normalizedScheduledAt,
          status: "pending",
        });
      }
      return true;
    });

    if (!updated) {
      await releaseQuota();
      return {
        success: false,
        error: "This post just started publishing, so it can't be edited.",
      };
    }

    // The edit is committed, so the charge stands: nothing below may refund
    // it or report the save as failed. It goes back to the caller, whose
    // follow-up (updateAndPublish's enqueue) decides on its own.
    const charged = reservation;
    reservation = null;

    const removedMediaIds = oldMediaIds.filter(
      (id) => !finalMediaIds.includes(id),
    );
    if (removedMediaIds.length > 0) {
      try {
        // Duplicate and "Post again" copy media ids, not the files, so an
        // upload can belong to several posts. Only delete the ones nothing
        // else uses.
        const sharedMediaIds = await mediaIdsUsedByOtherPosts(
          userId,
          postId,
          removedMediaIds,
        );
        const orphanedMediaIds = removedMediaIds.filter(
          (id) => !sharedMediaIds.has(id),
        );
        if (orphanedMediaIds.length > 0) {
          await db
            .delete(mediaUploads)
            .where(
              and(
                eq(mediaUploads.userId, userId),
                inArray(mediaUploads.id, orphanedMediaIds),
              ),
            );
        }
      } catch (e) {
        // The post is saved; a leftover upload row is harmless.
        console.error("updatePost orphaned media cleanup error:", e);
      }
    }

    return { success: true, reservation: charged };
  } catch (e) {
    await releaseQuota();
    console.error("updatePost error:", e);
    return {
      success: false,
      error: toSafeClientError(e, "Couldn't update this post. Please try again."),
    };
  }
}

export type ReschedulePostResult =
  | { success: true; postId: string; scheduledAt: string; queueSlotId: string | null }
  | { success: false; error: string };

/**
 * Move a scheduled post to a new time (calendar drag, "Reschedule" bulk
 * action). Only the time changes: content, accounts and metadata stay as they
 * are, and nothing is published here — the scheduled-publish cron reads
 * `posts.scheduled_at`, so this is a DB write and returns immediately.
 *
 * Pass `queueSlotId` when the post was dropped onto a queue slot so the slot
 * stays occupied; otherwise any pending slot link is released (the post now
 * has its own time). Already-scheduled posts were charged when they were
 * scheduled, so moving one never touches the free-post quota.
 */
export async function reschedulePost(
  postId: string,
  scheduledAt: Date | string,
  opts?: { queueSlotId?: string | null } | null,
): Promise<ReschedulePostResult> {
  const ws = await requireWorkspaceSession("edit_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;
  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }

  const nextAt = coerceDate(scheduledAt);
  const scheduleError = validateScheduledAtWindow(nextAt);
  if (scheduleError || !nextAt) {
    return {
      success: false,
      error: scheduleError ?? "Please pick a valid schedule date and time",
    };
  }

  // RPC input is unvalidated: anything but a non-empty string means "no slot".
  const slotId =
    typeof opts?.queueSlotId === "string" ? opts.queueSlotId.trim() || null : null;

  try {
    if (slotId && (!isValidUUID(slotId) || !(await userOwnsQueueSlot(userId, slotId)))) {
      return { success: false, error: "Invalid queue slot" };
    }

    // One transaction: if the slot write fails the time change rolls back, so
    // the calendar's optimistic revert lands on the time the post really has.
    const moved = await db.transaction(async (tx) => {
      // Conditional on status so a post the cron has just claimed (now
      // `publishing`) can't be dragged back into the schedule.
      const [row] = await tx
        .update(posts)
        .set({ scheduledAt: nextAt, updatedAt: new Date() })
        .where(
          and(
            eq(posts.id, postId),
            postScopeCondition(ws.ctx),
            eq(posts.status, "scheduled"),
          ),
        )
        .returning({ id: posts.id });
      if (!row) return false;

      await tx
        .delete(queuedPosts)
        .where(
          and(
            eq(queuedPosts.postId, postId),
            eq(queuedPosts.userId, userId),
            eq(queuedPosts.status, "pending"),
          ),
        );
      if (slotId) {
        await tx.insert(queuedPosts).values({
          userId,
          postId,
          slotId,
          scheduledFor: nextAt,
          status: "pending",
        });
      }
      return true;
    });

    if (!moved) {
      const [current] = await db
        .select({ status: posts.status })
        .from(posts)
        .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)))
        .limit(1);
      if (!current) return { success: false, error: "Post not found" };
      return {
        success: false,
        error:
          current.status === "draft"
            ? "Drafts don't have a time yet. Open the post and schedule it."
            : current.status === "publishing"
              ? "This post is already publishing, so it can't be moved."
              : "Only scheduled posts can be moved.",
      };
    }

    emitPostScheduledWebhook(userId, postId, nextAt);
    return {
      success: true,
      postId,
      scheduledAt: nextAt.toISOString(),
      queueSlotId: slotId,
    };
  } catch (e) {
    console.error("reschedulePost error:", e);
    return {
      success: false,
      error: toSafeClientError(e, "Couldn't move this post. Please try again."),
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
    emitPostDeletedWebhook(ws.ctx.resourceUserId, postId);
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
  if (!ws.ctx.permissions.has("edit_posts")) {
    return { success: false, error: "Forbidden" };
  }
  const userId = ws.ctx.resourceUserId;
  // publishNow: the free post is reserved before anything is written (only
  // for a draft; a scheduled post was already charged), so a quota failure
  // leaves the post scheduled with its queue slot.
  const result = await updatePostInScope(ws.ctx, {
    postId: draftId,
    content,
    selectedAccountIds,
    scheduledAt: null,
    mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
    metadata,
    publishNow: true,
  });
  if (!result.success) {
    return result;
  }

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
    // The charge normally stands: once anything is in flight, or the post was
    // failed (retried for free), a refund would let it publish again for free.
    // The exception is a publish that sent nothing and left the post a draft:
    // pressing Publish again charges that draft anew, so this one goes back.
    if (
      result.reservation &&
      err instanceof PublishNotDispatchedError &&
      (err.postStatus === "draft" || err.postStatus === "unchanged")
    ) {
      await releaseFreePost(result.reservation, userId).catch((releaseErr) =>
        console.error("updateAndPublish: free post release failed", releaseErr),
      );
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Publish failed after update",
    };
  }
}

/**
 * Kept for deploy skew: the SPA build still cached in browsers (and on main)
 * calls this RPC from the old edit page. The new composer no longer uses it.
 */
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

  return { ok: true, post, existingMedia, use24HourTimeFormat, dateFormat };
}
