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
import { prepareAndEnqueuePublish, type PublishBackend } from "./publish-enqueue.js";

export function useCloudflarePublishDispatch(): boolean {
  return useCloudflarePublishFromEnv();
}

let warnedLegacyBullmq = false;

/**
 * Refuse to accept a publish that nothing will ever run.
 *
 * With `PUBLISH_DISPATCH` unset, the backend is inferred from whether the
 * Cloudflare credentials parse, so a missing or misspelled `CF_PUBLISH_*`
 * secret would otherwise leave the publish with nowhere to go. Choosing
 * explicitly is fine either way: `cloudflare`, or `server` to run every
 * platform on the API process.
 *
 * `bullmq` is accepted as the old name for `server`. It used to enqueue to
 * BullMQ queues with no consumer in this repository, so those publishes sat
 * in `publishing` forever.
 *
 * Called before any row is written, so a misconfigured deployment leaves the
 * post a draft the user can retry rather than a half-published one.
 */
export function assertPublishDispatchConfigured(): void {
  const mode = process.env.PUBLISH_DISPATCH?.trim();
  if (mode === "bullmq" && !warnedLegacyBullmq) {
    warnedLegacyBullmq = true;
    console.warn(
      "[publish] PUBLISH_DISPATCH=bullmq is deprecated: publishes now run on the API process. Set PUBLISH_DISPATCH=server.",
    );
  }
  if (mode === "cloudflare" || mode === "server" || mode === "bullmq") return;
  if (cfPublishClientFromEnv()) return;
  throw new Error(
    "Publish dispatch is not configured: set CF_PUBLISH_WORKER_URL and " +
      "CF_PUBLISH_HMAC_SECRET, or set PUBLISH_DISPATCH=server to publish " +
      "every platform from the API process.",
  );
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
  opts?: {
    trackingId?: string;
    priority?: CfPublishPriority;
    onlyFromStatus?: "draft";
  },
): Promise<{ id: string; backend: PublishBackend; enqueued: number }> {
  const priority = opts?.priority ?? "now";

  const result = await prepareAndEnqueuePublish(app, data, {
    priority,
    trackingId: opts?.trackingId ?? data.trackingId,
    onlyFromStatus: opts?.onlyFromStatus,
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
  // Without Cloudflare there is no publish queue: jobs run on the API.
  if (jobNameOrPriority === "now" || jobNameOrPriority === "scheduled") {
    return useCloudflarePublishDispatch() ? cfPublishQueueName(jobNameOrPriority) : "server";
  }

  if (jobNameOrPriority.startsWith("token.")) return QUEUES.TOKEN;
  if (jobNameOrPriority.startsWith("cron.")) return QUEUES.SCHEDULER;
  return useCloudflarePublishDispatch() ? cfPublishQueueName("now") : "server";
}
