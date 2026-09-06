import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  connectedAccounts,
  postPublications,
  posts,
  queuedPosts,
} from "../db/schema.js";
import { maybeSendPostFailureEmail } from "../lib/post-failure-email.js";
import {
  deliverUserWebhookEvent,
  hasWebhookSubscriberFor,
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

const PUBLISH_WEBHOOK_SENT_KEY = "_publishWebhookSentAt";

/**
 * One publish webhook per post. Platform jobs run concurrently (CF Queues
 * fans out per platform), so the last two to finish can both see every row
 * terminal and both try to emit. Same conditional-jsonb claim the failure
 * email uses.
 *
 * The `::text` casts are load-bearing: jsonb_build_object is variadic "any",
 * so Postgres cannot infer the type of a bare bind parameter and rejects the
 * statement with 42P18 ("could not determine data type of parameter $1").
 */
async function claimPublishWebhook(postId: string): Promise<boolean> {
  const claimed = await db
    .update(posts)
    .set({
      metadata: sql`coalesce(${posts.metadata}, '{}'::jsonb) || jsonb_build_object(${PUBLISH_WEBHOOK_SENT_KEY}::text, ${new Date().toISOString()}::text)`,
      updatedAt: new Date(),
    })
    .where(
      sql`${posts.id} = ${postId} and (${posts.metadata}->>${PUBLISH_WEBHOOK_SENT_KEY}) is null`,
    )
    .returning({ id: posts.id });
  return claimed.length > 0;
}

/** Nothing was attempted — let the next finalize pass try again. */
async function releasePublishWebhookClaim(postId: string): Promise<void> {
  await db
    .update(posts)
    .set({
      metadata: sql`coalesce(${posts.metadata}, '{}'::jsonb) - ${PUBLISH_WEBHOOK_SENT_KEY}`,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId));
}

/**
 * Emit post.published / post.failed when every platform row is terminal.
 *
 * Awaits the HTTP delivery. The Cloudflare publish worker runs this from a
 * queue consumer, and a promise left in flight when that handler resolves is
 * cancelled with the isolate — a fire-and-forget send never leaves the edge.
 * Delivery failures are logged, never rethrown: a customer's endpoint being
 * down must not fail the publish that already succeeded.
 */
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
  if (!type) return;

  // Check before claiming: the claim writes post metadata, and most users have
  // no webhooks at all.
  if (!(await hasWebhookSubscriberFor(userId, type))) return;
  if (!(await claimPublishWebhook(postId))) return;

  try {
    await deliverUserWebhookEvent(userId, type, webhookData);
  } catch (err) {
    // Nothing left the process (the subscription lookup itself failed), so
    // hand the claim back rather than swallowing the event entirely.
    console.error("[finalize-post] webhook delivery failed", postId, err);
    await releasePublishWebhookClaim(postId).catch((releaseErr) =>
      console.error(
        "[finalize-post] failed to release webhook claim",
        postId,
        releaseErr,
      ),
    );
  }
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
