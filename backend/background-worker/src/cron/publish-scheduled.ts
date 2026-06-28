import { and, eq, lt, lte } from "drizzle-orm";
import {
  cfEnqueuePlatformJob,
  cfPublishClientFromEnv,
} from "@social0/shared";
import { db } from "../db/index.js";
import { posts, queuedPosts } from "../db/schema.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";

/** Scan DB for due scheduled posts and fan out to Cloudflare publish queues. */
export async function runPublishScheduledCron(): Promise<{
  processed: string[];
  queuedProcessed: string[];
}> {
  const cfClient = cfPublishClientFromEnv();
  if (!cfClient) {
    throw new Error(
      "CF publish is not configured (set CF_PUBLISH_WORKER_URL + CF_PUBLISH_HMAC_SECRET)",
    );
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await db
    .update(posts)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(posts.status, "publishing"), lt(posts.updatedAt, oneHourAgo)));

  const now = new Date();
  const due = await db
    .select({ id: posts.id, userId: posts.userId })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, now)));

  const processed: string[] = [];

  for (const post of due) {
    const targets = await loadPublicationTargets({
      postId: post.id,
      userId: post.userId,
    });
    for (const t of targets) {
      await cfEnqueuePlatformJob(
        {
          postId: post.id,
          userId: post.userId,
          publicationId: t.publicationId,
          connectedAccountId: t.connectedAccountId,
          platform: t.platform,
        },
        "scheduled",
        cfClient,
      );
    }
    processed.push(post.id);
  }

  const dueQueued = await db
    .select({
      id: queuedPosts.id,
      postId: queuedPosts.postId,
      userId: queuedPosts.userId,
    })
    .from(queuedPosts)
    .where(
      and(eq(queuedPosts.status, "pending"), lte(queuedPosts.scheduledFor, now)),
    );

  const queuedProcessed: string[] = [];
  for (const q of dueQueued) {
    const targets = await loadPublicationTargets({
      postId: q.postId,
      userId: q.userId,
    });
    for (const t of targets) {
      await cfEnqueuePlatformJob(
        {
          postId: q.postId,
          userId: q.userId,
          publicationId: t.publicationId,
          connectedAccountId: t.connectedAccountId,
          platform: t.platform,
        },
        "scheduled",
        cfClient,
      );
    }
    await db
      .update(queuedPosts)
      .set({ status: "done" })
      .where(eq(queuedPosts.id, q.id));
    queuedProcessed.push(q.postId);
  }

  return { processed, queuedProcessed };
}
