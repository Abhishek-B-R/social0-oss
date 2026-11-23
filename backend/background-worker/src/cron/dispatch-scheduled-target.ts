import {
  cfEnqueuePlatformJob,
  cfPublishClientFromEnv,
  getServerSidePublishPlatforms,
  type PublishPlatformJob,
} from "@social0/shared";

/**
 * Where one scheduled platform job runs.
 *
 * The API process already makes this choice for "publish now"
 * (`services/publish-enqueue.ts`): X and TikTok are pinned to Node because the
 * Worker fetch/OAuth path cannot do chunked X uploads and the Worker bundle
 * goes stale between deploys. The scheduled path skipped that choice entirely
 * and sent every platform to Cloudflare, so the *same post* published one way
 * from the composer and another way from the queue — and the endpoint written
 * for this (`POST /api/cron/publish-platform`, "used for Twitter from cron")
 * had no caller at all.
 */
export type ScheduledDispatchTarget = "server" | "cloudflare";

export function dispatchTargetFor(platform: string): ScheduledDispatchTarget {
  return getServerSidePublishPlatforms().has(platform) ? "server" : "cloudflare";
}

const DEFAULT_API_BASE_URL = "https://api.social0.app";

/**
 * How long to wait for the API to accept a server-side platform job. The route
 * answers 202 as soon as the job is started, so this only bounds a hung API:
 * without it undici waits five minutes per job, with the whole scheduled scan
 * (single-flight per cron) waiting behind it.
 */
export const SERVER_DISPATCH_TIMEOUT_MS = 15_000;

/**
 * How long to wait for `POST /api/cron/finalize-post`. Finalize sends the
 * failure email and delivers the user's webhooks, and a customer endpoint that
 * never answers holds it for about 35 seconds. Fastify keeps running the
 * handler after this side gives up, so a timeout only stops the wait; the
 * finalize itself still completes on the API.
 */
export const SERVER_FINALIZE_TIMEOUT_MS = 10_000;

/**
 * API host to hand server-side platform jobs to. The background worker runs on
 * the same VM as Fastify, so this is normally a loopback or the public API
 * host — never the SPA origin (`APP_URL`), which cannot serve `/api/cron/*`.
 */
export function serverPublishBaseUrl(): string {
  const configured =
    process.env.INTERNAL_API_BASE_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    process.env.AUTH_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return DEFAULT_API_BASE_URL;
}

/** Run one platform publish on the API process (X / TikTok). */
async function dispatchToServer(job: PublishPlatformJob): Promise<void> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error(
      `CRON_SECRET is not set — cannot hand ${job.platform} to the API for server-side publish`,
    );
  }

  const res = await fetch(`${serverPublishBaseUrl()}/api/cron/publish-platform`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(SERVER_DISPATCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Server-side publish dispatch failed: ${res.status} ${text.slice(0, 300)}`,
    );
  }
}

/**
 * Have the API finalize a post (aggregate status, queue slot, failure email,
 * webhooks). Finalize lives on the API with Resend and webhook delivery; this
 * worker only asks for it, after a fan-out that failed part way and so may
 * have no platform job left to finalize it.
 */
export async function requestServerFinalize(
  postId: string,
  userId: string,
): Promise<void> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("CRON_SECRET is not set — cannot ask the API to finalize the post");
  }

  const res = await fetch(`${serverPublishBaseUrl()}/api/cron/finalize-post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ postId, userId }),
    signal: AbortSignal.timeout(SERVER_FINALIZE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Finalize request failed: ${res.status} ${text.slice(0, 300)}`);
  }
}

/** Queue one platform publish on the Cloudflare publish worker. */
async function dispatchToCloudflare(job: PublishPlatformJob): Promise<void> {
  const client = cfPublishClientFromEnv();
  if (!client) {
    throw new Error(
      "CF publish is not configured (set CF_PUBLISH_WORKER_URL + CF_PUBLISH_HMAC_SECRET)",
    );
  }
  await cfEnqueuePlatformJob(job, "scheduled", client);
}

/**
 * Dispatch one scheduled platform job to whichever runner owns that platform.
 *
 * Resolved per job rather than once per scan: a missing Cloudflare secret must
 * not stop X from publishing, and a missing `CRON_SECRET` must not stop
 * LinkedIn.
 */
export async function dispatchScheduledTarget(
  job: PublishPlatformJob,
): Promise<ScheduledDispatchTarget> {
  const target = dispatchTargetFor(job.platform);
  if (target === "server") {
    await dispatchToServer(job);
    return "server";
  }
  await dispatchToCloudflare(job);
  return "cloudflare";
}
