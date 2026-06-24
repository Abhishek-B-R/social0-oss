import "dotenv/config";
import { loadEnv, allPlatformPublishQueueNames, getRedisUrl } from "@social0/shared";
import { createRedisConnection } from "./lib/connection.js";
import { closeJobProgress } from "./lib/job-progress.js";
import { initCircuitBreaker } from "./lib/circuit-breaker.js";
import { startBillingWorker } from "./workers/billing.js";
import { startEmailWorker } from "./workers/email.js";
import { startMediaWorker } from "./workers/media.js";
import { startPlatformPublishWorker } from "./workers/platform-publish.js";
import { startPublishWorker } from "./workers/publish.js";
import { startSchedulerWorker } from "./workers/scheduler.js";
import { startTokenWorker } from "./workers/token-refresh.js";

const env = loadEnv();
const connection = createRedisConnection();
initCircuitBreaker(connection);

const perPlatformConcurrency = Math.max(
  1,
  Math.floor(env.WORKER_PLATFORM_CONCURRENCY / allPlatformPublishQueueNames().length),
);

const workers = [
  startPublishWorker(connection, env.WORKER_PUBLISH_CONCURRENCY),
  ...allPlatformPublishQueueNames().map((queueName) =>
    startPlatformPublishWorker(connection, perPlatformConcurrency, queueName),
  ),
  startEmailWorker(connection, env.WORKER_EMAIL_CONCURRENCY),
  startTokenWorker(connection, 5),
  startSchedulerWorker(connection, 2),
  startBillingWorker(connection, 3),
  startMediaWorker(connection, 5),
];

console.info(
  `[worker] started ${workers.length} BullMQ workers (redis=upstash, platformQueues=${allPlatformPublishQueueNames().length})`,
);

async function shutdown() {
  console.info("[worker] shutting down...");
  await Promise.all(workers.map((w) => w.close()));
  await closeJobProgress();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
