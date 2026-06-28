import type { FastifyInstance } from "fastify";
import {
  createJobProgressStore,
  getRedisUrl,
  type JobProgressStore,
} from "@social0/shared";
import { createJobProgressPersistHooks } from "../lib/job-progress-persist.js";

declare module "fastify" {
  interface FastifyInstance {
    jobProgress: JobProgressStore;
  }
}

export async function registerQueuePlugin(app: FastifyInstance) {
  const redisUrl = getRedisUrl();
  const jobProgress = createJobProgressStore(
    redisUrl,
    createJobProgressPersistHooks(),
  );
  app.decorate("jobProgress", jobProgress);

  app.addHook("onClose", async () => {
    await jobProgress.close();
  });
}
