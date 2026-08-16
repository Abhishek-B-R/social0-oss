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
import { maybeFinalizePostPublish } from "../publish/finalize-post.js";
import {
  executePublish as executePublishCore,
  getPostPublicationList as getPostPublicationListCore,
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
): Promise<PublishResult> {
  const result = await executePublishCore(
    postId,
    userId,
    publicationIdFilter,
    options,
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
    .select({ id: posts.id })
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

  return executePublish(postId, userId, publicationIdFilter, options);
}
