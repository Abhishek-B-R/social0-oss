import "dotenv/config";
import { createRedisConnection } from "./lib/connection.js";
import { startPublishWorker } from "./workers/publish.js";
import { startPlatformPublishWorker } from "./workers/platform-publish.js";
import { startEmailWorker } from "./workers/email.js";
import { startTokenWorker } from "./workers/token-refresh.js";
import { startSchedulerWorker } from "./workers/scheduler.js";
import { startBillingWorker } from "./workers/billing.js";
import { startMediaWorker } from "./workers/media.js";
import { closeJobProgress } from "./lib/job-progress.js";
import { loadEnv } from "@social0/shared";

const env = loadEnv();
const connection = createRedisConnection();

const workers = [
  startPublishWorker(connection, env.ENGINE_PUBLISH_CONCURRENCY),
  startPlatformPublishWorker(connection, env.ENGINE_PLATFORM_CONCURRENCY),
  startEmailWorker(connection, env.ENGINE_EMAIL_CONCURRENCY),
  startTokenWorker(connection, 5),
  startSchedulerWorker(connection, 2),
  startBillingWorker(connection, 3),
  startMediaWorker(connection, 5),
];

console.info(
  `[engine] started ${workers.length} BullMQ workers (redis=${env.REDIS_URL})`,
);

async function shutdown() {
  console.info("[engine] shutting down...");
  await Promise.all(workers.map((w) => w.close()));
  await closeJobProgress();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
