import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUES, type BillingSyncJob } from "@social0/shared";
import { syncSubscriptionForUserId } from "../lib/billing-sync.js";

export function startBillingWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  return new Worker<BillingSyncJob>(
    QUEUES.BILLING,
    async (job) => {
      console.info(`[worker] billing sync userId=${job.data.userId}`);
      const result = await syncSubscriptionForUserId(job.data.userId);
      return result;
    },
    { connection, concurrency },
  );
}
