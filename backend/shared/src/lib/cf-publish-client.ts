import type { PublishPlatformJob } from "../types/jobs.js";
import {
  CF_PUBLISH_QUEUES,
  type CfPublishPriority,
} from "../constants/cf-publish-queues.js";

export type CfPublishClientConfig = {
  workerUrl: string;
  hmacSecret: string;
};

export function cfPublishQueueName(priority: CfPublishPriority): string {
  return priority === "now" ? CF_PUBLISH_QUEUES.NOW : CF_PUBLISH_QUEUES.SCHEDULED;
}

/** POST one platform job to the Cloudflare publish Worker. */
export async function cfEnqueuePlatformJob(
  job: PublishPlatformJob,
  priority: CfPublishPriority,
  config: CfPublishClientConfig,
): Promise<void> {
  const base = config.workerUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.hmacSecret}`,
    },
    body: JSON.stringify({ priority, job }),
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
  if (process.env.PUBLISH_DISPATCH === "cloudflare") return true;
  if (process.env.PUBLISH_DISPATCH === "bullmq") return false;
  return Boolean(cfPublishClientFromEnv());
}
