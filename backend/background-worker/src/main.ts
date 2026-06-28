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
