import type { PublishPlatformJob } from "../types/jobs.js";
import {
  CF_PUBLISH_QUEUES,
  type CfPublishPriority,
} from "../constants/cf-publish-queues.js";
import {
  CF_PUBLISH_SIGNATURE_HEADER,
  CF_PUBLISH_TIMESTAMP_HEADER,
  signPublishRequestBody,
} from "./cf-publish-hmac.js";

export type CfPublishClientConfig = {
  workerUrl: string;
  hmacSecret: string;
};

export function cfPublishQueueName(priority: CfPublishPriority): string {
  return priority === "now" ? CF_PUBLISH_QUEUES.NOW : CF_PUBLISH_QUEUES.SCHEDULED;
}

/**
 * How long to wait for the publish Worker to accept a job. `/enqueue` only puts
 * the job on a Cloudflare Queue, so this bounds a hung Worker rather than a
 * slow publish: without it undici waits five minutes, holding the publish-now
 * request or the whole scheduled scan behind one job.
 */
export const CF_PUBLISH_ENQUEUE_TIMEOUT_MS = 15_000;

/** POST one platform job to the Cloudflare publish Worker (HMAC-signed body). */
export async function cfEnqueuePlatformJob(
  job: PublishPlatformJob,
  priority: CfPublishPriority,
  config: CfPublishClientConfig,
): Promise<void> {
  const base = config.workerUrl.replace(/\/$/, "");
  const body = JSON.stringify({ priority, job });
  const { timestamp, signature } = await signPublishRequestBody(
    body,
    config.hmacSecret,
  );

  const res = await fetch(`${base}/enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CF_PUBLISH_TIMESTAMP_HEADER]: timestamp,
      [CF_PUBLISH_SIGNATURE_HEADER]: signature,
    },
    body,
    signal: AbortSignal.timeout(CF_PUBLISH_ENQUEUE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF publish enqueue failed: ${res.status} ${text}`);
  }
}

export function cfPublishClientFromEnv(): CfPublishClientConfig | null {
  const workerUrl = process.env.CF_PUBLISH_WORKER_URL?.trim();
  const hmacSecret = process.env.CF_PUBLISH_HMAC_SECRET?.trim();
  if (!workerUrl || !hmacSecret) return null;
  return { workerUrl, hmacSecret };
}

export function useCloudflarePublishFromEnv(): boolean {
  const mode = process.env.PUBLISH_DISPATCH?.trim();
  if (mode === "cloudflare") return true;
  if (mode === "server" || mode === "bullmq") return false;
  return Boolean(cfPublishClientFromEnv());
}
