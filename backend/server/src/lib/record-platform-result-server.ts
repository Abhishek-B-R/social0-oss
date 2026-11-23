import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  publishJobOutcome,
  type JobProgressPhase,
  type JobProgressSnapshot,
  type PublishPlatformJob,
} from "@social0/shared";
import { db } from "../db/index.js";
import {
  postPublications,
  posts,
  publishJobEvents,
  publishJobs,
} from "../db/schema.js";
import {
  resolveJobProgressStore,
  safeDbPublishTracking,
} from "./publish-job-tracking.js";

/**
 * Whether the progress store's persist hook wrote the event `emit` was given.
 * Only `app.jobProgress` carries that hook, and `emit` returns `null` without
 * running it when Redis holds no snapshot for the job: scheduled jobs never
 * get one (`initScheduledPublishTracking` writes Postgres only), and a
 * publish-now loses it whenever Redis is unavailable. Treating those as
 * persisted left their timeline with nothing past "queued".
 */
function hookedStorePersisted(
  app: FastifyInstance | null,
  snapshot: JobProgressSnapshot | null,
): boolean {
  return Boolean(app?.jobProgress) && snapshot !== null;
}

/** Job progress for platform publishes that run on the API (not CF worker). */
export async function trackPlatformPhaseServer(
  app: FastifyInstance | null,
  job: PublishPlatformJob,
  phase: JobProgressPhase,
  message: string,
): Promise<void> {
  if (!job.trackingId) return;

  const progress = await resolveJobProgressStore(app);
  const snapshot = await progress.emit({
    trackingId: job.trackingId,
    postId: job.postId,
    userId: job.userId,
    phase,
    platform: job.platform,
    connectedAccountId: job.connectedAccountId,
    message,
  });

  // Same ownership rule as `recordPlatformResultServer`: the hooked store has
  // already written this event when it ran, so the app-less store (and a
  // hooked store that found no Redis snapshot) leave it to us.
  const storeAlreadyPersisted = hookedStorePersisted(app, snapshot);

  await safeDbPublishTracking(async () => {
    if (!storeAlreadyPersisted) {
      await db.insert(publishJobEvents).values({
        trackingId: job.trackingId!,
        postId: job.postId,
        userId: job.userId,
        phase,
        platform: job.platform,
        connectedAccountId: job.connectedAccountId,
        message,
      });
    }

    await db
      .update(publishJobs)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(publishJobs.trackingId, job.trackingId!));
  });
}

export async function recordPlatformResultServer(
  app: FastifyInstance | null,
  job: PublishPlatformJob,
  success: boolean,
  message: string,
): Promise<void> {
  if (!success) {
    // Only a delivery nobody is working on can be marked failed here. A
    // "publishing" row belongs to a live run (possibly another one: a
    // duplicate job, Publish now racing the cron) and a "published" row is
    // done; that run records its own outcome. Demoting either failed a post
    // mid-upload and invited a Retry that posted it twice.
    const demoted = await db
      .update(postPublications)
      .set({
        status: "failed",
        lastError: message,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(postPublications.id, job.publicationId),
          or(
            isNull(postPublications.status),
            inArray(postPublications.status, ["pending", "failed"]),
          ),
        ),
      )
      .returning({ id: postPublications.id });
    if (demoted.length === 0) {
      const [current] = await db
        .select({ status: postPublications.status })
        .from(postPublications)
        .where(eq(postPublications.id, job.publicationId))
        .limit(1);
      if (current?.status === "publishing") return;
    }
  }

  const pubs = await db
    .select({ status: postPublications.status })
    .from(postPublications)
    .where(eq(postPublications.postId, job.postId));

  const published = pubs.filter((p) => p.status === "published").length;
  const failed = pubs.filter((p) => p.status === "failed").length;

  if (pubs.length > 0) {
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

  const progress = await resolveJobProgressStore(app);
  const phase: JobProgressPhase = success ? "platform_success" : "platform_failed";
  const snapshot = await progress.emit({
    trackingId: job.trackingId,
    postId: job.postId,
    userId: job.userId,
    phase,
    platform: job.platform,
    connectedAccountId: job.connectedAccountId,
    message,
  });

  // `app.jobProgress` is the store built with the persist hooks, so when it
  // ran it has already written this event (and the terminal one). The
  // app-less store (`getRedisOnlyJobProgress`) leaves that to us — writing
  // them unconditionally is what put two rows in `publish_job_events` for
  // every phase.
  const storeAlreadyPersisted = hookedStorePersisted(app, snapshot);

  await safeDbPublishTracking(async () => {
    const [row] = await db
      .select({ total: publishJobs.total })
      .from(publishJobs)
      .where(eq(publishJobs.trackingId, job.trackingId!))
      .limit(1);

    if (!row) return;

    // Count the publications rather than incrementing the stored counters.
    // Incrementing double-counted whatever the progress store had already
    // added — a single-platform failure ended up `failed = 2` against
    // `total = 1`, so `failed === total` was false and the job's terminal
    // event read "All platforms published" for a publish that published
    // nothing. It also mis-counted on every BullMQ retry of the same job.
    // The publication rows are the source of truth and are already updated
    // above, so deriving from them is both correct and idempotent.
    const completed = published;
    const failedCount = failed;
    const total = row.total;
    const progress = { completed, failed: failedCount, total };

    if (!storeAlreadyPersisted) {
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
    }

    const outcome = publishJobOutcome(completed, failedCount, total);

    await db
      .update(publishJobs)
      .set({
        status: outcome.status,
        completed,
        failed: failedCount,
        updatedAt: new Date(),
      })
      .where(eq(publishJobs.trackingId, job.trackingId!));

    if (outcome.allDone && !storeAlreadyPersisted) {
      await db.insert(publishJobEvents).values({
        trackingId: job.trackingId!,
        postId: job.postId,
        userId: job.userId,
        phase: outcome.status,
        message: outcome.message,
        progress,
      });
    }
  });
}
