import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUES, type BillingSyncJob } from "@social0/shared";

export function startBillingWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  return new Worker<BillingSyncJob>(
    QUEUES.BILLING,
    async (job) => {
      console.info(`[worker] billing sync userId=${job.data.userId}`);
      return { synced: true };
    },
    { connection, concurrency },
  );
}
