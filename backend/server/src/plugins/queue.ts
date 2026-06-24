import type { FastifyInstance } from "fastify";
import { Queue, type ConnectionOptions } from "bullmq";
import {
  QUEUES,
  getRedisUrl,
  createJobProgressStore,
  type JobProgressStore,
  type PublishPostJob,
  type PublishPlatformJob,
  type EmailPostFailedJob,
  type TokenRefreshJob,
  type MediaConfirmJob,
  type BillingSyncJob,
} from "@social0/shared";
import { createJobProgressPersistHooks } from "../lib/job-progress-persist.js";

declare module "fastify" {
  interface FastifyInstance {
    redisConnection: ConnectionOptions;
    jobProgress: JobProgressStore;
    queues: {
      publish: Queue<PublishPostJob>;
      platformPublish: Queue<PublishPlatformJob>;
      platformPublishDlq: Queue<PublishPlatformJob>;
      email: Queue<EmailPostFailedJob>;
      token: Queue<TokenRefreshJob | { sweep: true }>;
      scheduler: Queue;
      billing: Queue<BillingSyncJob>;
      media: Queue<MediaConfirmJob>;
    };
  }
}

export async function registerQueuePlugin(app: FastifyInstance) {
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
    publish: new Queue<PublishPostJob>(QUEUES.PUBLISH, {
      connection,
      defaultJobOptions,
    }),
    platformPublish: new Queue<PublishPlatformJob>(QUEUES.PLATFORM_PUBLISH, {
      connection,
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 5,
      },
    }),
    platformPublishDlq: new Queue<PublishPlatformJob>(
      QUEUES.PLATFORM_PUBLISH_DLQ,
      {
        connection,
        defaultJobOptions: {
          removeOnComplete: false,
          removeOnFail: false,
        },
      },
    ),
    email: new Queue<EmailPostFailedJob>(QUEUES.EMAIL, {
      connection,
      defaultJobOptions,
    }),
    token: new Queue(QUEUES.TOKEN, { connection, defaultJobOptions }),
    scheduler: new Queue(QUEUES.SCHEDULER, { connection, defaultJobOptions }),
    billing: new Queue<BillingSyncJob>(QUEUES.BILLING, {
      connection,
      defaultJobOptions,
    }),
    media: new Queue<MediaConfirmJob>(QUEUES.MEDIA, {
      connection,
      defaultJobOptions,
    }),
  };

  app.decorate("queues", queues);

  app.addHook("onClose", async () => {
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await jobProgress.close();
  });
}
