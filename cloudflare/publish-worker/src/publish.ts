import type {
  PublishJobEnvelope,
  PublishPlatformJob,
  PublishPostJob,
  PublishTarget,
} from "./types";

/**
 * Phase 1: Worker owns queueing/retries; API callback runs platform publish (tokens in Postgres).
 * Phase 2: port execute-publish here with Hyperdrive + R2.
 */
export async function runPlatformPublish(
  job: PublishPlatformJob,
  env: Env,
): Promise<{ ok: boolean; error?: string }> {
  const base = env.API_CALLBACK_URL?.replace(/\/$/, "");
  if (!base) {
    return { ok: false, error: "API_CALLBACK_URL not configured on Worker" };
  }
  if (!env.PUBLISH_HMAC_SECRET) {
    return { ok: false, error: "PUBLISH_HMAC_SECRET not configured on Worker" };
  }

  const res = await fetch(`${base}/api/internal/publish-platform`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PUBLISH_HMAC_SECRET}`,
    },
    body: JSON.stringify(job),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || `callback failed ${res.status}` };
  }

  return { ok: true };
}

async function fetchPublishTargets(
  job: PublishPostJob,
  env: Env,
): Promise<PublishTarget[]> {
  const base = env.API_CALLBACK_URL?.replace(/\/$/, "");
  if (!base) throw new Error("API_CALLBACK_URL not configured");
  if (!env.PUBLISH_HMAC_SECRET) {
    throw new Error("PUBLISH_HMAC_SECRET not configured");
  }

  const res = await fetch(`${base}/api/internal/publish-targets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PUBLISH_HMAC_SECRET}`,
    },
    body: JSON.stringify({
      postId: job.postId,
      userId: job.userId,
      connectedAccountIds: job.connectedAccountIds,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`publish-targets failed: ${res.status} ${text}`);
  }

  return (await res.json()) as PublishTarget[];
}

/** Fan-out orchestrator — enqueue one platform job per target. */
export async function fanOutPost(
  job: PublishPostJob,
  env: Env,
): Promise<{ enqueued: number }> {
  const targets = await fetchPublishTargets(job, env);

  for (const t of targets) {
    const platformJob: PublishPlatformJob = {
      postId: job.postId,
      userId: job.userId,
      trackingId: job.trackingId,
      publicationId: t.publicationId,
      connectedAccountId: t.connectedAccountId,
      platform: t.platform,
    };
    await env.PUBLISH_PLATFORM_QUEUE.send({
      kind: "platform",
      job: platformJob,
    } satisfies PublishJobEnvelope);
  }

  return { enqueued: targets.length };
}
