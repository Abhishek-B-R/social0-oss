import { and, eq, lt, lte } from "drizzle-orm";
import { Queue, type ConnectionOptions } from "bullmq";
import { cfPublishClientFromEnv, cfEnqueuePlatformJob, JOB_NAMES, QUEUES, type PublishPostJob } from "@social0/shared";
import { loadPublicationTargets } from "../publish/load-targets.js";
import { db } from "../db/index.js";
import { posts, queuedPosts } from "../db/schema.js";
import { executePublish } from "../publish/execute-publish.js";

export async function runPublishScheduledCron(
  connection: ConnectionOptions,
): Promise<{ processed: string[]; queuedProcessed: string[] }> {
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

  const cfClient = cfPublishClientFromEnv();
  const publishQueue = cfClient
    ? null
    : new Queue<PublishPostJob>(QUEUES.PUBLISH, { connection });
  const processed: string[] = [];

  for (const post of due) {
    if (cfClient) {
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
    } else {
      await publishQueue!.add(JOB_NAMES.PUBLISH_POST, {
        postId: post.id,
        userId: post.userId,
      });
    }
    processed.push(post.id);
  }

  const dueQueued = await db
    .select({ id: queuedPosts.id, postId: queuedPosts.postId, userId: queuedPosts.userId })
    .from(queuedPosts)
    .where(
      and(eq(queuedPosts.status, "pending"), lte(queuedPosts.scheduledFor, now)),
    );

  const queuedProcessed: string[] = [];
  for (const q of dueQueued) {
    const result = await executePublish(q.postId, q.userId);
    await db
      .update(queuedPosts)
      .set({ status: result.success ? "done" : "failed" })
      .where(eq(queuedPosts.id, q.id));
    queuedProcessed.push(q.postId);
  }

  if (publishQueue) {
    await publishQueue.close();
  }
  return { processed, queuedProcessed };
}
