/**
 * BFF/RPC publish surface: session-aware wrappers around the core publish engine.
 * Core platform execution lives in `../publish/execute-publish.ts`.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { publishLimiter, enforceRateLimit } from "@/lib/ratelimit";
import { requireWorkspaceSession } from "@/lib/workspace/session";
import { postScopeCondition } from "@/lib/workspace/context";
import { isValidPostId } from "@/lib/publish-validation";
import type { PublicationErrorKind } from "@/lib/publication-error-kind";
import { releaseFreePost, type FreePostReservation } from "@/lib/plan-limits";
import { maybeFinalizePostPublish } from "../publish/finalize-post.js";
import { reserveFreePostQuota } from "./posts.js";
import {
  executePublish as executePublishCore,
  getPostPublicationList as getPostPublicationListCore,
  type PublishControl,
  type PublishOptions,
  type PublishResult,
} from "../publish/execute-publish.js";

export type { PublishOptions, PublishResult };

/**
 * Returns the list of publications for a post (for progress UI).
 * Caller must be authenticated and own the post in the active workspace.
 */
export async function getPostPublicationList(postId: string): Promise<
  {
    publicationId: string;
    connectedAccountId: string;
    platform: string;
    platformUsername: string | null;
    publicationStatus: string;
    platformPostUrl: string | null;
    lastError: string | null;
    errorKind: PublicationErrorKind | null;
  }[]
> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return [];
  if (!isValidPostId(postId)) return [];
  const [owned] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)))
    .limit(1);
  if (!owned) return [];
  return getPostPublicationListCore(postId, ws.ctx.resourceUserId);
}

/**
 * Session/dashboard publish: runs core executePublish then finalizes
 * (aggregate status, failure email, user webhooks).
 * Worker/CF paths call `publish/execute-publish` + `maybeFinalizePostPublish` directly.
 */
export async function executePublish(
  postId: string,
  userId?: string,
  publicationIdFilter?: string,
  options?: PublishOptions,
  control?: PublishControl,
): Promise<PublishResult> {
  const result = await executePublishCore(
    postId,
    userId,
    publicationIdFilter,
    options,
    control,
  );

  // Dashboard composer uses inline executePublish — finalize owns webhooks + failure email.
  if (userId) {
    await maybeFinalizePostPublish(postId, userId);
  }

  return result;
}

/**
 * Server action: publishes a post to selected accounts.
 * Verifies the current user owns the post and enforces publish rate limits.
 */
export async function publishPost(
  postId: string,
  options?: PublishOptions,
  publicationIdFilter?: string,
): Promise<PublishResult> {
  const ws = await requireWorkspaceSession("publish_posts");
  if (!ws.ok) {
    return {
      success: false,
      error: ws.error,
      results: [],
    };
  }
  const userId = ws.ctx.resourceUserId;
  const actorUserId = ws.ctx.actorUserId;

  const rate = await enforceRateLimit(publishLimiter, actorUserId);
  if (!rate.allowed) {
    return {
      success: false,
      error:
        rate.status === 503
          ? "Publish is temporarily unavailable. Try again later."
          : "Publish rate limit exceeded. Try again later.",
      results: [],
    };
  }

  if (!isValidPostId(postId)) {
    return {
      success: false,
      error: "Invalid post ID format",
      results: [],
    };
  }

  const [owned] = await db
    .select({ id: posts.id, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)))
    .limit(1);
  if (!owned) {
    return {
      success: false,
      error: "Post not found",
      results: [],
    };
  }

  // A person retrying one delivery from the dashboard may take over a run
  // that was interrupted: the row tells them it may already be live, so the
  // click is their decision. A whole-post publish never does.
  const control: PublishControl = {
    takeOverInterrupted: typeof publicationIdFilter === "string",
  };

  // Publishing a draft is a "Publish now" submission and costs one free post,
  // same as updateAndPublish. Every other call here (retries, per-platform
  // progress, a post already submitted) is free.
  if (owned.status === "draft") {
    const charged = await chargeDraftPublish(postId, userId);
    if (!charged.ok) {
      return { success: false, error: charged.error, results: [] };
    }
    const result = await executePublish(
      postId,
      userId,
      publicationIdFilter,
      options,
      control,
    );
    // Nothing was attempted (no publication it could reach): hand the draft
    // and the free post back instead of leaving both spent.
    if (result.results.length === 0) {
      await db
        .update(posts)
        .set({ status: "draft", updatedAt: new Date() })
        .where(and(eq(posts.id, postId), eq(posts.status, "publishing")));
      await releaseFreePost(charged.reservation, userId);
    }
    return result;
  }

  return executePublish(postId, userId, publicationIdFilter, options, control);
}

/**
 * Charge one free post for publishing a draft and move it out of `draft` in the
 * same step. The conditional status update is the claim: two racing clicks both
 * reserve, but only one moves the draft; the loser gives its post back and
 * stops, so the post is not published twice either.
 */
async function chargeDraftPublish(
  postId: string,
  userId: string,
): Promise<
  | { ok: true; reservation: FreePostReservation }
  | { ok: false; error: string }
> {
  const quota = await reserveFreePostQuota(userId, postId);
  if (!quota.ok) return { ok: false, error: quota.error };

  try {
    const claimed = await db
      .update(posts)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(and(eq(posts.id, postId), eq(posts.status, "draft")))
      .returning({ id: posts.id });
    if (claimed.length > 0) return { ok: true, reservation: quota.reservation };
  } catch (err) {
    await releaseFreePost(quota.reservation, userId);
    throw err;
  }

  await releaseFreePost(quota.reservation, userId);
  return { ok: false, error: "This post is already publishing." };
}
