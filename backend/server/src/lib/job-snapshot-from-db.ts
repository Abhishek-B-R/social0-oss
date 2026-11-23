import { desc, eq, sql } from "drizzle-orm";
import type { JobProgressSnapshot } from "@social0/shared";
import { db } from "../db/index.js";
import { publishJobEvents, publishJobs } from "../db/schema.js";
import {
  hasPublishJobTables,
  isMissingRelationError,
} from "./publish-job-tracking.js";

/**
 * Most events one snapshot carries, newest kept. A publish writes a handful
 * per platform; this only bounds a pathological job, which every read of
 * GET /v1/jobs/:id and every SSE poll used to load in full.
 */
export const MAX_SNAPSHOT_EVENTS = 500;

/**
 * Cheap "did this job change?" probe for the SSE poll: the job row's
 * `updated_at` and status plus its event count (indexed on tracking_id).
 * One small query instead of the full snapshot rebuild. Null when the job
 * (or the tables) do not exist.
 */
export async function loadJobChangeMarker(trackingId: string): Promise<string | null> {
  if (!(await hasPublishJobTables())) return null;
  try {
    const [row] = await db
      .select({
        updatedAt: publishJobs.updatedAt,
        status: publishJobs.status,
        events: sql<number>`(select count(*)::int from ${publishJobEvents} where ${publishJobEvents.trackingId} = ${trackingId})`,
      })
      .from(publishJobs)
      .where(eq(publishJobs.trackingId, trackingId))
      .limit(1);
    if (!row) return null;
    return `${row.updatedAt?.toISOString() ?? ""}|${row.status}|${row.events}`;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    throw err;
  }
}

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

    const newestFirst = await db
      .select()
      .from(publishJobEvents)
      .where(eq(publishJobEvents.trackingId, trackingId))
      .orderBy(desc(publishJobEvents.createdAt))
      .limit(MAX_SNAPSHOT_EVENTS);
    const events = newestFirst.reverse();

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
