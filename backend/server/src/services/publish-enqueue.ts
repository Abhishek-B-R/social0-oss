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
import { posts, publishJobEvents, publishJobs } from "../db/schema.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";
import {
  resolveJobProgressStore,
  safeDbPublishTracking,
} from "../lib/publish-job-tracking.js";
import {
  dispatchPlatformJob,
  useCloudflarePublishDispatch,
} from "./publish-dispatch.js";
import { runPlatformJobOnServer } from "../publish/process-platform-server.js";

export type PublishPriority = "now" | "scheduled";

async function markPostPublishing(postId: string, userId: string) {
  await db
    .update(posts)
    .set({ status: "publishing", failureReason: null, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));
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
  const trackingId = opts.trackingId ?? data.trackingId;
  const job: PublishPostJob = { ...data, trackingId };

  const targets = await loadPublicationTargets(job);
  if (targets.length === 0) {
    throw new Error(`No publication targets for post ${job.postId}`);
  }

  await markPostPublishing(job.postId, job.userId);

  if (trackingId) {
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

  for (const t of targets) {
    const platformJob: PublishPlatformJob = {
      postId: job.postId,
      userId: job.userId,
      trackingId,
      publicationId: t.publicationId,
      connectedAccountId: t.connectedAccountId,
      platform: t.platform,
    };

    if (backend === "cloudflare" && SERVER_SIDE_PUBLISH_PLATFORMS.has(t.platform)) {
      // Kill switch TWITTER_PUBLISH_ON_API=1 — otherwise X goes to CF like other platforms.
      void runPlatformJobOnServer(app, platformJob).catch((err) => {
        console.error("[publish] server-side platform job failed", err);
      });
    } else if (backend === "cloudflare") {
      await dispatchPlatformJob(platformJob, opts.priority);
    } else {
      await enqueueBullmqPlatformJob(app, platformJob, { delay: opts.delay });
    }
    await emitPlatformQueuedEvent(app, job, t);
  }

  return {
    id: trackingId ?? `publish-${job.postId}`,
    backend,
    enqueued: targets.length,
    trackingId,
  };
}
