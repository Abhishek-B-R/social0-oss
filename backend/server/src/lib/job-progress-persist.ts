import type {
  JobProgressEvent,
  JobProgressHooks,
  JobProgressSnapshot,
} from "@social0/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { publishJobEvents, publishJobs } from "../db/schema.js";

function mapStatus(
  status: JobProgressSnapshot["status"],
): "queued" | "processing" | "completed" | "failed" {
  return status;
}

export function createJobProgressPersistHooks(): JobProgressHooks {
  return {
    async onInit(snapshot) {
      await db
        .insert(publishJobs)
        .values({
          trackingId: snapshot.trackingId,
          postId: snapshot.postId,
          userId: snapshot.userId,
          status: "queued",
          total: snapshot.total,
          completed: snapshot.completed,
          failed: snapshot.failed,
        })
        .onConflictDoUpdate({
          target: publishJobs.trackingId,
          set: {
            status: "queued",
            total: snapshot.total,
            updatedAt: new Date(),
          },
        });

      const event = snapshot.events[0];
      if (!event) return;
      await db.insert(publishJobEvents).values({
        trackingId: snapshot.trackingId,
        postId: snapshot.postId,
        userId: snapshot.userId,
        phase: event.phase,
        message: event.message ?? null,
        progress: event.progress,
      });
    },
    async onEvent(event: JobProgressEvent, snapshot: JobProgressSnapshot) {
      await db
        .update(publishJobs)
        .set({
          status: mapStatus(snapshot.status),
          total: snapshot.total,
          completed: snapshot.completed,
          failed: snapshot.failed,
          updatedAt: new Date(),
        })
        .where(eq(publishJobs.trackingId, snapshot.trackingId));

      await db.insert(publishJobEvents).values({
        trackingId: snapshot.trackingId,
        postId: snapshot.postId,
        userId: snapshot.userId,
        phase: event.phase,
        platform: event.platform ?? null,
        connectedAccountId: event.connectedAccountId ?? null,
        message: event.message ?? null,
        progress: event.progress,
      });
    },
  };
}
