import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { Queue, type ConnectionOptions } from "bullmq";
import {
  QUEUES,
  getRedisUrl,
  createJobProgressStore,
  type JobProgressStore,
} from "@social0/shared";
import { createJobProgressPersistHooks } from "../lib/job-progress-persist.js";

declare module "fastify" {
  interface FastifyInstance {
    redisConnection: ConnectionOptions;
    jobProgress: JobProgressStore;
    queues: {
      scheduler: Queue;
      token: Queue<{ sweep: true }>;
    };
  }
}

async function queuePlugin(app: FastifyInstance) {
  const redisUrl = getRedisUrl();
  const connection: ConnectionOptions = {
    url: redisUrl,
    maxRetriesPerRequest: null,
  };
  app.decorate("redisConnection", connection);

  const jobProgress = createJobProgressStore(
    redisUrl,
    createJobProgressPersistHooks(),
  );
  app.decorate("jobProgress", jobProgress);

  const defaultJobOptions = {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 5000 },
  };

  const queues = {
    scheduler: new Queue(QUEUES.SCHEDULER, { connection, defaultJobOptions }),
    token: new Queue(QUEUES.TOKEN, { connection, defaultJobOptions }),
  };

  app.decorate("queues", queues);

  app.addHook("onClose", async () => {
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await jobProgress.close();
  });
}

/** ponytail: fp breaks Fastify encapsulation so /api + /admin routes see queues/jobProgress */
export const registerQueuePlugin = fp(queuePlugin, { name: "queue-plugin" });
