import { Queue, Worker, type ConnectionOptions } from "bullmq";
import {
  JOB_NAMES,
  QUEUES,
  platformPublishQueueName,
  type PublishPostJob,
  type PublishPlatformJob,
} from "@social0/shared";
import { getJobProgress } from "../lib/job-progress.js";
import { loadPublicationTargets } from "../publish/load-targets.js";

async function track(
  job: PublishPostJob,
  phase: Parameters<ReturnType<typeof getJobProgress>["emit"]>[0]["phase"],
  extra?: Partial<Parameters<ReturnType<typeof getJobProgress>["emit"]>[0]>,
) {
  if (!job.trackingId) return;
  await getJobProgress().emit({
    trackingId: job.trackingId,
    postId: job.postId,
    userId: job.userId,
    phase,
    ...extra,
  });
}

export function startPublishWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  const platformQueues = new Map<string, Queue<PublishPlatformJob>>();

  function getPlatformQueue(platform: string) {
    const name = platformPublishQueueName(
      platform as PublishPlatformJob["platform"],
    );
    let q = platformQueues.get(name);
    if (!q) {
      q = new Queue<PublishPlatformJob>(name, { connection });
      platformQueues.set(name, q);
    }
    return q;
  }

  return new Worker<PublishPostJob>(
    QUEUES.PUBLISH,
    async (bullJob) => {
      const data = bullJob.data;
      if (bullJob.name === JOB_NAMES.MEDIA_CONFIRM) {
        throw new Error("media.confirm must use media queue");
      }

      const targets = await loadPublicationTargets(data);
      if (targets.length === 0) {
        await track(data, "failed", {
          message: "No publication targets for this post",
        });
        throw new Error(`No publication targets for post ${data.postId}`);
      }

      await track(data, "fan_out", {
        message: `Fanning out to ${targets.length} platforms`,
        setTotal: targets.length,
      });

      await Promise.all(
        targets.map(async (t) => {
          await track(data, "platform_queued", {
            platform: t.platform,
            connectedAccountId: t.connectedAccountId,
            message: `Queued ${t.platform}`,
          });
          const queue = getPlatformQueue(t.platform);
          return queue.add(
            JOB_NAMES.PUBLISH_PLATFORM,
            {
              postId: data.postId,
              userId: data.userId,
              trackingId: data.trackingId,
              publicationId: t.publicationId,
              connectedAccountId: t.connectedAccountId,
              platform: t.platform,
            },
            {
              jobId: `platform-${t.publicationId}`,
              attempts: 5,
              backoff: { type: "exponential", delay: 10_000 },
            },
          );
        }),
      );

      return { fanOut: targets.length };
    },
    { connection, concurrency },
  );
}
