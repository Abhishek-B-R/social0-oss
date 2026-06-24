import { Queue, Worker, type ConnectionOptions } from "bullmq";
import {
  JOB_NAMES,
  QUEUES,
  type PublishPostJob,
  type PublishPlatformJob,
  type SupportedPlatform,
} from "@social0/shared";
import { getJobProgress } from "../lib/job-progress.js";

/** Stub until DB layer is ported — returns publication targets for a post. */
async function loadPublicationTargets(
  job: PublishPostJob,
): Promise<
  Array<{
    publicationId: string;
    connectedAccountId: string;
    platform: SupportedPlatform;
  }>
> {
  if (job.connectedAccountIds?.length) {
    return job.connectedAccountIds.map((id, i) => ({
      publicationId: `${job.postId}-${i}`,
      connectedAccountId: id,
      platform: "twitter" as SupportedPlatform,
    }));
  }
  console.warn(
    `[worker] loadPublicationTargets stub — postId=${job.postId} userId=${job.userId}`,
  );
  return [];
}

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
  const platformQueue = new Queue<PublishPlatformJob>(QUEUES.PLATFORM_PUBLISH, {
    connection,
  });

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
          message: "No publication targets — wire DB",
        });
        throw new Error(
          `No publication targets for post ${data.postId} — wire DB`,
        );
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
          return platformQueue.add(
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
            },
          );
        }),
      );

      return { fanOut: targets.length };
    },
    { connection, concurrency },
  );
}
