import type { FastifyInstance } from "fastify";
import type { PublishPlatformJob } from "@social0/shared";
import { runPlatformJobOnServer } from "./process-platform-server.js";

/**
 * Platform publishes running inside this API process (X and TikTok by default,
 * see `SERVER_SIDE_PUBLISH_PLATFORMS`). They outlive the request that started
 * them, so a shutdown has to wait for them: a process killed mid-upload leaves
 * the publication `publishing` with nothing to retry it, the stale sweeper
 * fails it an hour later, and a tweet X had already accepted is then posted a
 * second time by the user's Retry.
 */
const inFlight = new Set<Promise<void>>();

/** Run `promise` in the background, tracked until it settles. */
export function trackServerPublishJob(promise: Promise<void>): void {
  const tracked: Promise<void> = promise
    .catch(() => {})
    .finally(() => {
      inFlight.delete(tracked);
    });
  inFlight.add(tracked);
}

/**
 * Start one platform publish on this process without awaiting it (the caller
 * is an HTTP handler that answers right away). Failures are logged here;
 * `runPlatformJobOnServer` records the result and finalizes the post itself.
 */
export function startPlatformJobOnServer(
  app: FastifyInstance | null,
  job: PublishPlatformJob,
  logLabel: string,
): void {
  trackServerPublishJob(
    runPlatformJobOnServer(app, job).catch((err) => {
      console.error(logLabel, job.platform, err);
    }),
  );
}

export function serverPublishJobsInFlight(): number {
  return inFlight.size;
}

/**
 * Wait for every in-process publish to settle, including ones started while
 * waiting (requests still being answered during shutdown), for at most
 * `timeoutMs`. Resolves to the number still running when it gave up.
 */
export async function drainServerPublishJobs(timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (inFlight.size > 0) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = await Promise.race([
      Promise.allSettled([...inFlight]).then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), remainingMs);
      }),
    ]);
    clearTimeout(timer);
    if (timedOut) break;
  }
  return inFlight.size;
}
