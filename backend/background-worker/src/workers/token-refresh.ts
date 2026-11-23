import { Worker, type ConnectionOptions } from "bullmq";
import { JOB_NAMES, QUEUES } from "@social0/shared";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import {
  BATCH_SIZE,
  filterAccountsNeedingHealthCheck,
  runTokenHealthCheck,
} from "@social0/shared/lib/token-health";

/** Proactive token validation sweep - only job on the token queue. */
export function startTokenWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  return new Worker(
    QUEUES.TOKEN,
    async (job) => {
      if (job.name !== JOB_NAMES.TOKEN_HEALTH_SWEEP) {
        console.warn(`[background-worker] ignoring token job: ${job.name}`);
        return { skipped: true };
      }

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const accounts = await db
        .select({
          id: connectedAccounts.id,
          platform: connectedAccounts.platform,
          platformUserId: connectedAccounts.platformUserId,
          encryptedAccessToken: connectedAccounts.encryptedAccessToken,
          encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
          tokenExpiresAt: connectedAccounts.tokenExpiresAt,
          lastSyncedAt: connectedAccounts.lastSyncedAt,
          tokenStatus: connectedAccounts.tokenStatus,
          platformMetadata: connectedAccounts.platformMetadata,
        })
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.isActive, true),
            or(
              isNull(connectedAccounts.lastSyncedAt),
              lt(connectedAccounts.lastSyncedAt, twentyFourHoursAgo),
            ),
          ),
        );

      const toCheck = filterAccountsNeedingHealthCheck(accounts, {
        now,
        maxAgeMs: 24 * 60 * 60 * 1000,
        strictMaxAgeMs: 12 * 60 * 60 * 1000,
      });
      // One failing batch (e.g. a DB write error) must not skip every batch
      // after it. The job still fails at the end so BullMQ retries; accounts
      // that were written are no longer stale, so a retry only redoes the rest.
      let failedBatches = 0;
      let lastError: unknown = null;
      for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
        const batch = toCheck.slice(i, i + BATCH_SIZE);
        try {
          await runTokenHealthCheck(batch, {
            now,
            tryRefresh: true,
          });
        } catch (err) {
          failedBatches += 1;
          lastError = err;
          console.error("[background-worker] token health batch failed", {
            batchStart: i,
            batchSize: batch.length,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (failedBatches > 0) {
        throw new Error(
          `token health sweep: ${failedBatches} batch(es) failed; last error: ${
            lastError instanceof Error ? lastError.message : String(lastError)
          }`,
        );
      }
      return { swept: toCheck.length };
    },
    { connection, concurrency },
  );
}
