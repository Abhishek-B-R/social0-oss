import { and, eq } from "drizzle-orm";
import { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import {
  JOB_NAMES,
  getRedisUrl,
  platformPublishQueueName,
  SERVER_SIDE_PUBLISH_PLATFORMS,
  type PublishPlatformJob,
  type PublishPostJob,
} from "@social0/shared";
import { db } from "../db/index.js";
import {
  postPublications,
  posts,
  publishJobEvents,
  publishJobs,
} from "../db/schema.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";
import {
  resolveJobProgressStore,
  safeDbPublishTracking,
} from "../lib/publish-job-tracking.js";
import {
  dispatchPlatformJob,
  useCloudflarePublishDispatch,
  assertPublishDispatchConfigured,
} from "./publish-dispatch.js";
import { runPlatformJobOnServer } from "../publish/process-platform-server.js";

export type PublishPriority = "now" | "scheduled";

/** Claims the post for publishing and reports the status it held before. */
async function markPostPublishing(
  postId: string,
  userId: string,
): Promise<string | null> {
  const [before] = await db
    .select({ status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  await db
    .update(posts)
    .set({ status: "publishing", failureReason: null, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

  return before?.status ?? null;
}

/**
 * Put the post back where the user can act on it when the fan-out failed.
 *
 * `markPostPublishing` runs before anything is dispatched, and `publishing` is
 * a terminal-looking state for the caller: the post can no longer be edited,
 * deleted, or re-published, and only the cron's hour-old sweeper eventually
 * marks it failed. So a publish worker that was briefly unreachable took the
 * post away from its owner for an hour.
 *
 * The same rule as the scheduled cron in `background-worker`: nothing
 * dispatched means restore the previous status so the user can retry; a
 * partial fan-out stays `publishing` — re-running would double-publish what
 * already went out — with the undispatched publications failed so the post
 * can finalize instead of hanging.
 */
async function recoverFromFanOutFailure(
  postId: string,
  userId: string,
  previousStatus: string | null,
  undispatched: Awaited<ReturnType<typeof loadPublicationTargets>>,
  dispatched: number,
  message: string,
): Promise<void> {
  if (dispatched === 0) {
    await db
      .update(posts)
      .set({
        status: (previousStatus as "draft" | "scheduled" | null) ?? "draft",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.userId, userId),
          eq(posts.status, "publishing"),
        ),
      );
    return;
  }

  for (const target of undispatched) {
    await db
      .update(postPublications)
      .set({ status: "failed", lastError: message, updatedAt: new Date() })
      .where(eq(postPublications.id, target.publicationId));
  }
}

/** Persist tracking row for SSE when publish_jobs table exists. */
export async function initPublishJobTracking(input: {
  trackingId: string;
  postId: string;
  userId: string;
  total: number;
}) {
  await safeDbPublishTracking(async () => {
    const now = new Date();
    await db
      .insert(publishJobs)
      .values({
        trackingId: input.trackingId,
        postId: input.postId,
        userId: input.userId,
        status: "queued",
        total: input.total,
        completed: 0,
        failed: 0,
      })
      .onConflictDoUpdate({
        target: publishJobs.trackingId,
        set: {
          status: "queued",
          total: input.total,
          updatedAt: now,
        },
      });

    await db.insert(publishJobEvents).values({
      trackingId: input.trackingId,
      postId: input.postId,
      userId: input.userId,
      phase: "queued",
      message: "Publish job queued",
      progress: { completed: 0, failed: 0, total: input.total },
    });
  });
}

async function initQueuedJobProgress(
  app: FastifyInstance | null,
  job: PublishPostJob,
  targets: Awaited<ReturnType<typeof loadPublicationTargets>>,
) {
  if (!job.trackingId) return;

  const progress = await resolveJobProgressStore(app);

  await progress.initJob({
    trackingId: job.trackingId,
    postId: job.postId,
    userId: job.userId,
    total: targets.length,
  });

  await progress.emit({
    trackingId: job.trackingId,
    postId: job.postId,
    userId: job.userId,
    phase: "fan_out",
    message: `Fanning out to ${targets.length} platforms`,
    setTotal: targets.length,
  });
}

async function emitPlatformQueuedEvent(
  app: FastifyInstance | null,
  job: PublishPostJob,
  target: Awaited<ReturnType<typeof loadPublicationTargets>>[number],
) {
  if (!job.trackingId) return;
  const progress = await resolveJobProgressStore(app);
  await progress.emit({
    trackingId: job.trackingId,
    postId: job.postId,
    userId: job.userId,
    phase: "platform_queued",
    platform: target.platform,
    connectedAccountId: target.connectedAccountId,
    message: `Queued ${target.platform}`,
  });
}

async function enqueueBullmqPlatformJob(
  app: FastifyInstance | null,
  platformJob: PublishPlatformJob,
  opts?: { delay?: number },
) {
  const connection = { url: getRedisUrl() };
  const queueName = platformPublishQueueName(platformJob.platform);
  const queue = new Queue<PublishPlatformJob>(queueName, { connection });
  await queue.add(JOB_NAMES.PUBLISH_PLATFORM, platformJob, {
    jobId: `platform-${platformJob.publicationId}`,
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    delay: opts?.delay,
  });
  await queue.close();
}

/**
 * API-side fan-out: load targets, update DB, enqueue one job per platform.
 * Never runs executePublish inline.
 */
export async function prepareAndEnqueuePublish(
  app: FastifyInstance | null,
  data: PublishPostJob,
  opts: {
    priority: PublishPriority;
    trackingId?: string;
    delay?: number;
  },
): Promise<{
  id: string;
  backend: "cloudflare" | "bullmq";
  enqueued: number;
  trackingId?: string;
}> {
  // Before `markPostPublishing`: a deployment that cannot dispatch must leave
  // the post exactly as it was.
  assertPublishDispatchConfigured();

  const trackingId = opts.trackingId ?? data.trackingId;
  const job: PublishPostJob = { ...data, trackingId };

  const targets = await loadPublicationTargets(job);
  if (targets.length === 0) {
    throw new Error(`No publication targets for post ${job.postId}`);
  }

  const previousStatus = await markPostPublishing(job.postId, job.userId);

  // `initQueuedJobProgress` below runs `initJob`, whose persist hooks write the
  // same `publish_jobs` row and the same "queued" event — but only when the
  // store is `app.jobProgress`. Doing it here as well is what gave every
  // publish two identical queued events in its progress feed.
  if (trackingId && !app?.jobProgress) {
    await initPublishJobTracking({
      trackingId,
      postId: job.postId,
      userId: job.userId,
      total: targets.length,
    });
  }

  const backend = useCloudflarePublishDispatch() ? "cloudflare" : "bullmq";

  if (backend === "bullmq" && !getRedisUrl()) {
    throw new Error("BullMQ redis connection not available");
  }

  await initQueuedJobProgress(app, job, targets);

  let dispatched = 0;
  try {
    for (const t of targets) {
      const platformJob: PublishPlatformJob = {
        postId: job.postId,
        userId: job.userId,
        trackingId,
        publicationId: t.publicationId,
        connectedAccountId: t.connectedAccountId,
        platform: t.platform,
      };

      if (
        backend === "cloudflare" &&
        SERVER_SIDE_PUBLISH_PLATFORMS.has(t.platform)
      ) {
        // X + TikTok stay on the API unless TWITTER_PUBLISH_ON_CF / TIKTOK_PUBLISH_ON_CF=1.
        void runPlatformJobOnServer(app, platformJob).catch((err) => {
          console.error("[publish] server-side platform job failed", err);
        });
      } else if (backend === "cloudflare") {
        await dispatchPlatformJob(platformJob, opts.priority);
      } else {
        await enqueueBullmqPlatformJob(app, platformJob, { delay: opts.delay });
      }
      dispatched += 1;
      await emitPlatformQueuedEvent(app, job, t);
    }
  } catch (err) {
    await recoverFromFanOutFailure(
      job.postId,
      job.userId,
      previousStatus,
      targets.slice(dispatched),
      dispatched,
      err instanceof Error ? err.message : "Could not queue this platform",
    );
    throw err;
  }

  return {
    id: trackingId ?? `publish-${job.postId}`,
    backend,
    enqueued: targets.length,
    trackingId,
  };
}
