import { asc, eq } from "drizzle-orm";
import type { JobProgressSnapshot } from "@social0/shared";
import { db } from "../db/index.js";
import { publishJobEvents, publishJobs } from "../db/schema.js";
import {
  hasPublishJobTables,
  isMissingRelationError,
} from "./publish-job-tracking.js";

/** Rebuild SSE snapshot from Postgres when Redis TTL expired. */
export async function loadJobSnapshotFromDb(
  trackingId: string,
): Promise<JobProgressSnapshot | null> {
  if (!(await hasPublishJobTables())) return null;

  try {
    const [job] = await db
      .select()
      .from(publishJobs)
      .where(eq(publishJobs.trackingId, trackingId))
      .limit(1);

    if (!job) return null;

    const events = await db
      .select()
      .from(publishJobEvents)
      .where(eq(publishJobEvents.trackingId, trackingId))
      .orderBy(asc(publishJobEvents.createdAt));

    return {
      trackingId: job.trackingId,
      postId: job.postId,
      userId: job.userId,
      status: job.status,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      updatedAt: job.updatedAt?.toISOString() ?? new Date().toISOString(),
      events: events.map((e) => ({
        trackingId: e.trackingId,
        postId: e.postId,
        userId: e.userId,
        phase: e.phase as JobProgressSnapshot["events"][0]["phase"],
        platform: e.platform ?? undefined,
        connectedAccountId: e.connectedAccountId ?? undefined,
        message: e.message ?? undefined,
        progress: e.progress ?? {
          completed: job.completed,
          failed: job.failed,
          total: job.total,
        },
        ts: e.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
    };
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    throw err;
  }
}
