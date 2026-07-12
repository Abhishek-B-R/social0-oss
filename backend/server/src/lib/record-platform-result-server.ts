import { and, desc, eq } from "drizzle-orm";
import type { PublishPlatformJob } from "@social0/shared";
import { db } from "../db/index.js";
import {
  postPublications,
  posts,
  publishJobEvents,
  publishJobs,
} from "../db/schema.js";
import { safeDbPublishTracking } from "./publish-job-tracking.js";

/** Job progress for platform publishes that run on the API (not CF worker). */
export async function trackPlatformPhaseServer(
  job: PublishPlatformJob,
  phase: string,
  message: string,
): Promise<void> {
  if (!job.trackingId) return;

  await safeDbPublishTracking(async () => {
    await db.insert(publishJobEvents).values({
      trackingId: job.trackingId!,
      postId: job.postId,
      userId: job.userId,
      phase,
      platform: job.platform,
      connectedAccountId: job.connectedAccountId,
      message,
    });

    await db
      .update(publishJobs)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(publishJobs.trackingId, job.trackingId!));
  });
}

export async function recordPlatformResultServer(
  job: PublishPlatformJob,
  success: boolean,
  message: string,
): Promise<void> {
  if (!success) {
    await db
      .update(postPublications)
      .set({
        status: "failed",
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(postPublications.id, job.publicationId));
  }

  const pubs = await db
    .select({ status: postPublications.status })
    .from(postPublications)
    .where(eq(postPublications.postId, job.postId));

  if (pubs.length > 0) {
    const published = pubs.filter((p) => p.status === "published").length;
    const failed = pubs.filter((p) => p.status === "failed").length;
    if (published + failed >= pubs.length) {
      const postStatus =
        published === 0 ? "failed" : failed === 0 ? "published" : "partial";

      let failureReason: string | null = null;
      if (failed > 0) {
        const [failedRow] = await db
          .select({ lastError: postPublications.lastError })
          .from(postPublications)
          .where(
            and(
              eq(postPublications.postId, job.postId),
              eq(postPublications.status, "failed"),
            ),
          )
          .orderBy(desc(postPublications.updatedAt))
          .limit(1);
        failureReason = failedRow?.lastError?.trim() || message;
      }

      await db
        .update(posts)
        .set({
          status: postStatus,
          failureReason,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, job.postId));
    }
  }

  if (!job.trackingId) return;

  await safeDbPublishTracking(async () => {
    const [row] = await db
      .select({
        total: publishJobs.total,
        completed: publishJobs.completed,
        failed: publishJobs.failed,
      })
      .from(publishJobs)
      .where(eq(publishJobs.trackingId, job.trackingId!))
      .limit(1);

    if (!row) return;

    const completed = row.completed + (success ? 1 : 0);
    const failed = row.failed + (success ? 0 : 1);
    const total = row.total;
    const progress = { completed, failed, total };
    const phase = success ? "platform_success" : "platform_failed";

    await db.insert(publishJobEvents).values({
      trackingId: job.trackingId!,
      postId: job.postId,
      userId: job.userId,
      phase,
      platform: job.platform,
      connectedAccountId: job.connectedAccountId,
      message,
      progress,
    });

    const allDone = completed + failed >= total && total > 0;
    const status = allDone
      ? failed === total
        ? "failed"
        : "completed"
      : "processing";

    await db
      .update(publishJobs)
      .set({
        status,
        completed,
        failed,
        updatedAt: new Date(),
      })
      .where(eq(publishJobs.trackingId, job.trackingId!));

    if (allDone) {
      await db.insert(publishJobEvents).values({
        trackingId: job.trackingId!,
        postId: job.postId,
        userId: job.userId,
        phase: status,
        message:
          failed === total
            ? "Publish finished with failures"
            : completed > 0 && failed > 0
              ? `Published to ${completed}/${total} platforms (${failed} failed)`
              : "All platforms published",
        progress,
      });
    }
  });
}
