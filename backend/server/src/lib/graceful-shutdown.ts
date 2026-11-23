import type { FastifyInstance } from "fastify";
import {
  drainServerPublishJobs,
  serverPublishJobsInFlight,
} from "../publish/server-platform-jobs.js";

/** Longest a shutdown waits for in-process X/TikTok publishes to finish. */
export const PUBLISH_DRAIN_MS = 120_000;

/**
 * How long open HTTP connections may hold the shutdown. Job progress SSE
 * streams stay open for up to 15 minutes; their clients reconnect or fall back
 * to polling, so they are cut after this rather than waited for.
 */
export const HTTP_GRACE_MS = 10_000;

/**
 * Hard stop for the whole shutdown. The process manager's kill timeout (PM2
 * `kill_timeout`, set in `backend/ecosystem.config.cjs`) must be longer, or it
 * kills the process before the drain ends and the in-flight publishes die
 * anyway.
 */
export const SHUTDOWN_DEADLINE_MS = HTTP_GRACE_MS + PUBLISH_DRAIN_MS + 5_000;

/** What PM2 waits before SIGKILL when the app declares no `kill_timeout`. */
export const PM2_DEFAULT_KILL_TIMEOUT_MS = 1_600;

/**
 * The kill timeout PM2 will apply to this process, or `null` when PM2 did not
 * start it. PM2 hands a process its own config as environment variables
 * (`pm_id`, and `kill_timeout` when the app declares one); the daemon-wide
 * `PM2_KILL_TIMEOUT` and then PM2's 1.6 s default apply otherwise.
 */
export function pm2KillTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  if (env.pm_id === undefined) return null;
  for (const raw of [env.kill_timeout, env.PM2_KILL_TIMEOUT]) {
    const ms = Number(raw);
    if (raw && Number.isFinite(ms) && ms > 0) return ms;
  }
  return PM2_DEFAULT_KILL_TIMEOUT_MS;
}

/**
 * Say so at boot when PM2 would SIGKILL this process before the shutdown
 * deadline, which turns every reload into a mid-upload kill of the in-process
 * publishes. Usually means the API was started without the ecosystem file.
 */
export function warnIfKillTimeoutTooShort(
  app: FastifyInstance,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const killTimeoutMs = pm2KillTimeoutMs(env);
  if (killTimeoutMs === null || killTimeoutMs > SHUTDOWN_DEADLINE_MS) return;
  app.log.error(
    { killTimeoutMs, shutdownDeadlineMs: SHUTDOWN_DEADLINE_MS },
    "PM2 kill_timeout is shorter than the shutdown deadline, so a reload kills in-process publishes mid-upload; start the API from backend/ecosystem.config.cjs",
  );
}

/**
 * Make `app.close()` wait for the platform publishes running in this process.
 *
 * Register it after every plugin: Fastify runs `onClose` hooks newest first,
 * and only after the server has stopped taking requests, so this runs once no
 * new job can start and before the queue plugin closes the Redis connections
 * those jobs still report their progress through.
 */
export function registerPublishDrain(
  app: FastifyInstance,
  timeoutMs: number = PUBLISH_DRAIN_MS,
): void {
  app.addHook("onClose", async () => {
    const running = serverPublishJobsInFlight();
    if (running === 0) return;
    app.log.info({ running }, "waiting for in-process publishes to finish");
    const stillRunning = await drainServerPublishJobs(timeoutMs);
    if (stillRunning > 0) {
      app.log.error(
        { stillRunning, timeoutMs },
        "in-process publishes did not finish before shutdown; they will be left publishing",
      );
    }
  });
}

/**
 * Close the app on SIGINT / SIGTERM (PM2 `reload` sends SIGINT) instead of
 * dying mid-request, then exit. Repeated signals are ignored; the deadline
 * still exits if something hangs.
 */
export function closeOnShutdownSignals(app: FastifyInstance): void {
  warnIfKillTimeoutTooShort(app);
  let closing = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "shutting down");

    const hardStop = setTimeout(() => {
      app.log.error("shutdown deadline passed, exiting");
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS);
    const dropConnections = setTimeout(() => {
      app.server.closeAllConnections?.();
    }, HTTP_GRACE_MS);

    app.close().then(
      () => {
        clearTimeout(hardStop);
        clearTimeout(dropConnections);
        process.exit(0);
      },
      (err: unknown) => {
        app.log.error({ err }, "shutdown failed");
        process.exit(1);
      },
    );
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
