/**
 * BFF/RPC publish surface: session-aware wrappers around the core publish engine.
 * Core platform execution lives in `../publish/execute-publish.ts`.
 */

import { publishLimiter, enforceRateLimit } from "@/lib/ratelimit";
import { requireWorkspaceSession } from "@/lib/workspace/session";
import { isValidPostId } from "@/lib/publish-validation";
import { emitPublishWebhooksForPost } from "../publish/finalize-post.js";
import {
  executePublish as executePublishCore,
  getPostPublicationList as getPostPublicationListCore,
  type PublishOptions,
  type PublishResult,
} from "../publish/execute-publish.js";

export type { PublishOptions, PublishResult };

/**
 * Returns the list of publications for a post (for progress UI).
 * Caller must be authenticated and own the post.
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
  return getPostPublicationListCore(postId, ws.ctx.resourceUserId);
}

/**
 * Session/dashboard publish: runs core executePublish then emits user webhooks.
 * Worker/CF paths should call `publish/execute-publish` directly (finalize handles webhooks).
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

  // Dashboard composer uses inline executePublish (not the async worker finalize path).
  if (userId) {
    await emitPublishWebhooksForPost(postId, userId);
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

  return executePublish(postId, userId, publicationIdFilter, options);
}
