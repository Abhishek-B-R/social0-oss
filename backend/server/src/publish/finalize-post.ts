import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  connectedAccounts,
  postPublications,
  posts,
  queuedPosts,
} from "../db/schema.js";
import { maybeSendPostFailureEmail } from "../lib/post-failure-email.js";
import {
  emitUserWebhookEvent,
  type WebhookEvent,
} from "../lib/user-webhook-delivery.js";

async function loadPublicationRows(postId: string) {
  return db
    .select({
      status: postPublications.status,
      platform: connectedAccounts.platform,
      platformUsername: connectedAccounts.platformUsername,
      connectedAccountId: connectedAccounts.id,
      lastError: postPublications.lastError,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(eq(postPublications.postId, postId));
}

/** Emit post.published / post.failed when every platform row is terminal. */
export async function emitPublishWebhooksForPost(
  postId: string,
  userId: string,
): Promise<void> {
  const pubs = await loadPublicationRows(postId);

  if (
    pubs.some(
      (p) => p.status === "pending" || p.status === "publishing",
    )
  ) {
    return;
  }

  const succeeded = pubs.filter((p) => p.status === "published").length;
  const failed = pubs.filter((p) => p.status === "failed").length;
  if (pubs.length === 0) return;

  const overallStatus =
    succeeded === 0 ? "failed" : failed === 0 ? "published" : "partial";

  const webhookData = {
    post_id: postId,
    status: overallStatus,
    platforms: pubs.map((p) => ({
      platform: p.platform,
      status: p.status,
      connected_account_id: p.connectedAccountId,
      error: p.lastError ?? null,
    })),
  };

  let type: WebhookEvent | null = null;
  if (overallStatus === "published" || overallStatus === "partial") {
    type = "post.published";
  } else if (overallStatus === "failed") {
    type = "post.failed";
  }
  if (type) emitUserWebhookEvent(userId, type, webhookData);
}

/** After per-platform jobs finish, update aggregate post status and notify user. */
export async function maybeFinalizePostPublish(
  postId: string,
  userId: string,
): Promise<void> {
  const pubs = await loadPublicationRows(postId);

  if (
    pubs.some(
      (p) => p.status === "pending" || p.status === "publishing",
    )
  ) {
    return;
  }

  const succeeded = pubs.filter((p) => p.status === "published").length;
  const failed = pubs.filter((p) => p.status === "failed").length;
  if (pubs.length === 0) return;

  const overallStatus =
    succeeded === 0 ? "failed" : failed === 0 ? "published" : "partial";

  await db
    .update(posts)
    .set({ status: overallStatus, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

  await db
    .update(queuedPosts)
    .set({
      status: overallStatus === "failed" ? "failed" : "done",
    })
    .where(
      and(
        eq(queuedPosts.postId, postId),
        eq(queuedPosts.userId, userId),
        eq(queuedPosts.status, "processing"),
      ),
    );

  const failedList = pubs.filter((p) => p.status === "failed");
  if (failedList.length > 0) {
    await maybeSendPostFailureEmail({
      userId,
      postId,
      failures: failedList.map((f) => ({
        platform: f.platform,
        platformUsername: f.platformUsername,
        error: f.lastError,
      })),
    });
  }

  await emitPublishWebhooksForPost(postId, userId);
}
