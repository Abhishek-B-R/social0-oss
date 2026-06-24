import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  JOB_NAMES,
  QUEUES,
  type PublishPostJob,
  type PublishPlatformJob,
} from "@social0/shared";

const DISPATCH_CLOUDFLARE = "cloudflare";

function cfWorkerUrl(): string | null {
  const url = process.env.CF_PUBLISH_WORKER_URL?.trim();
  return url || null;
}

function cfSecret(): string | null {
  return process.env.CF_PUBLISH_HMAC_SECRET?.trim() || null;
}

export function useCloudflarePublishDispatch(): boolean {
  if (process.env.PUBLISH_DISPATCH === DISPATCH_CLOUDFLARE) return true;
  if (process.env.PUBLISH_DISPATCH === "bullmq") return false;
  return Boolean(cfWorkerUrl() && cfSecret());
}

async function postToCfWorker(
  envelope:
    | { kind: "orchestrator"; job: PublishPostJob }
    | { kind: "platform"; job: PublishPlatformJob },
): Promise<{ status: "queued" }> {
  const base = cfWorkerUrl()!.replace(/\/$/, "");
  const secret = cfSecret()!;

  const res = await fetch(`${base}/enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(envelope),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF publish worker enqueue failed: ${res.status} ${text}`);
  }

  return { status: "queued" };
}

/** Enqueue publish — Cloudflare Worker when configured, else BullMQ. */
export async function dispatchPublishPost(
  app: FastifyInstance,
  data: PublishPostJob,
  opts?: { delay?: number; trackingId?: string },
): Promise<{ id: string; backend: "cloudflare" | "bullmq" }> {
  const trackingId = opts?.trackingId ?? data.trackingId;

  if (useCloudflarePublishDispatch()) {
    if (opts?.delay && opts.delay > 0) {
      throw new Error(
        "Scheduled publish via delay is not yet supported on Cloudflare dispatch; use bullmq or schedule via cron",
      );
    }
    await postToCfWorker({
      kind: "orchestrator",
      job: { ...data, trackingId },
    });
    return { id: trackingId ?? `cf-${data.postId}`, backend: "cloudflare" };
  }

  if (!app?.queues?.publish) {
    throw new Error("BullMQ publish queue not available");
  }

  const jobId = trackingId
    ? `publish-${trackingId}`
    : opts?.delay
      ? `publish-scheduled-${data.postId}-${Date.now()}`
      : `publish-${data.postId}-${Date.now()}`;

  const job = await app.queues.publish.add(
    JOB_NAMES.PUBLISH_POST,
    { ...data, trackingId },
    { jobId, delay: opts?.delay },
  );

  return { id: job.id!, backend: "bullmq" };
}

export function createPublishTrackingId() {
  return randomUUID();
}

export function queueNameForJob(jobName: string): string {
  if (jobName.startsWith("publish.")) {
    return useCloudflarePublishDispatch() ? "cloudflare" : QUEUES.PUBLISH;
  }
  return QUEUES.PUBLISH;
}
