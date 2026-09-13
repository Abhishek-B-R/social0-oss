import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Must run before any module that reads process.env (ESM hoists static imports).
config({
  path: resolve(fileURLToPath(new URL("../..", import.meta.url)), ".env"),
});

const { createRedisConnection } = await import("./lib/connection.js");
const { startSchedulerWorker } = await import("./workers/scheduler.js");
const { startTokenWorker } = await import("./workers/token-refresh.js");

const connection = createRedisConnection();

const workers = [
  // ponytail: concurrency 1 avoids overlapping publish-scheduled scans
  startSchedulerWorker(connection, 1),
  startTokenWorker(connection, 5),
];

/**
 * Without these, a cron that throws at the top level is recorded in Redis and
 * nowhere else: BullMQ swallows an unlistened `error` event, and `failed`
 * carries the only report that a run did not happen. These are cron jobs, so a
 * silent failure means scheduled posts simply do not go out.
 */
const ERROR_LOG_INTERVAL_MS = 60_000;

for (const worker of workers) {
  // Connection errors repeat on every reconnect attempt, so throttle them —
  // a multi-hour Redis outage should leave a trail, not flood the log.
  let lastErrorLogAt = 0;
  worker.on("error", (err) => {
    const now = Date.now();
    if (now - lastErrorLogAt < ERROR_LOG_INTERVAL_MS) return;
    lastErrorLogAt = now;
    console.error(`[background-worker] ${worker.name} worker error`, err);
  });
  worker.on("failed", (job, err) => {
    console.error(
      `[background-worker] ${worker.name} job failed`,
      job?.name ?? "unknown",
      job?.id ?? "",
      err,
    );
  });
}

console.info(
  `[background-worker] started ${workers.length} consumers (scheduler: publish-scheduled, repost, autoplug, billing-zombie | token: health-sweep)`,
);

async function shutdown() {
  console.info("[background-worker] shutting down...");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
