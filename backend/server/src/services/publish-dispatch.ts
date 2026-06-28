import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  cfEnqueuePlatformJob,
  cfPublishClientFromEnv,
  cfPublishQueueName,
  QUEUES,
  type CfPublishPriority,
  type PublishPlatformJob,
  type PublishPostJob,
  useCloudflarePublishFromEnv,
} from "@social0/shared";
import { prepareAndEnqueuePublish } from "./publish-enqueue.js";

export function useCloudflarePublishDispatch(): boolean {
  return useCloudflarePublishFromEnv();
}

/** Enqueue a single platform publish job to Cloudflare. */
export async function dispatchPlatformJob(
  job: PublishPlatformJob,
  priority: CfPublishPriority,
): Promise<void> {
  const config = cfPublishClientFromEnv();
  if (!config) {
    throw new Error("Cloudflare publish dispatch is not configured");
  }
  await cfEnqueuePlatformJob(job, priority, config);
}

/** Enqueue publish - fans out per platform on the API, returns 202 immediately. */
export async function dispatchPublishPost(
  app: FastifyInstance | null,
  data: PublishPostJob,
  opts?: { delay?: number; trackingId?: string; priority?: CfPublishPriority },
): Promise<{ id: string; backend: "cloudflare" | "bullmq"; enqueued: number }> {
  const priority =
    opts?.priority ?? (opts?.delay && opts.delay > 0 ? "scheduled" : "now");

  if (useCloudflarePublishDispatch() && opts?.delay && opts.delay > 0) {
    throw new Error(
      "Delayed publish on Cloudflare uses scheduled posts + cron; do not pass delay",
    );
  }

  const result = await prepareAndEnqueuePublish(app, data, {
    priority,
    trackingId: opts?.trackingId ?? data.trackingId,
    delay: opts?.delay,
  });

  return {
    id: result.id,
    backend: result.backend,
    enqueued: result.enqueued,
  };
}

export function createPublishTrackingId() {
  return randomUUID();
}

export function queueNameForJob(
  jobNameOrPriority: string | CfPublishPriority = "now",
): string {
  if (jobNameOrPriority === "now" || jobNameOrPriority === "scheduled") {
    if (useCloudflarePublishDispatch()) {
      return cfPublishQueueName(jobNameOrPriority);
    }
    return QUEUES.PUBLISH;
  }

  if (jobNameOrPriority.startsWith("publish.")) {
    return useCloudflarePublishDispatch()
      ? cfPublishQueueName("now")
      : QUEUES.PUBLISH;
  }
  if (jobNameOrPriority.startsWith("token.")) return QUEUES.TOKEN;
  if (jobNameOrPriority.startsWith("cron.")) return QUEUES.SCHEDULER;
  return QUEUES.PUBLISH;
}
