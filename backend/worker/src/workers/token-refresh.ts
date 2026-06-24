import { Worker, type ConnectionOptions } from "bullmq";
import { JOB_NAMES, QUEUES, type TokenRefreshJob } from "@social0/shared";
import { refreshPlatformToken } from "../tokens/refresh.js";

export function startTokenWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  return new Worker(
    QUEUES.TOKEN,
    async (job) => {
      if (job.name === JOB_NAMES.TOKEN_HEALTH_SWEEP) {
        console.info("[worker] token health sweep — wire DB to list expiring tokens");
        return { swept: true };
      }
      const data = job.data as TokenRefreshJob;
      await refreshPlatformToken(data);
      return { refreshed: true };
    },
    { connection, concurrency },
  );
}
