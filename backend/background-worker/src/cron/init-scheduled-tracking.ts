import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { publishJobEvents, publishJobs } from "../db/schema.js";

/**
 * Create publish_jobs + initial event so CF worker can write the same timeline
 * as publish-now. Failures here must not block enqueue.
 */
export async function initScheduledPublishTracking(input: {
  postId: string;
  userId: string;
  total: number;
}): Promise<string | undefined> {
  const trackingId = randomUUID();
  try {
    await db.insert(publishJobs).values({
      trackingId,
      postId: input.postId,
      userId: input.userId,
      status: "queued",
      total: input.total,
      completed: 0,
      failed: 0,
    });
    await db.insert(publishJobEvents).values({
      trackingId,
      postId: input.postId,
      userId: input.userId,
      phase: "queued",
      message: "Scheduled publish job queued",
      progress: { completed: 0, failed: 0, total: input.total },
    });
    return trackingId;
  } catch (e) {
    console.warn(
      "[publish-scheduled] tracking init failed (continuing without timeline)",
      e instanceof Error ? e.message : e,
    );
    return undefined;
  }
}
