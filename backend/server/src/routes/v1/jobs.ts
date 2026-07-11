import type { FastifyInstance } from "fastify";
import type { JobProgressEvent } from "@social0/shared";
import { apiError } from "../../lib/api-errors.js";
import { loadJobSnapshotFromDb } from "../../lib/job-snapshot-from-db.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";

export async function registerJobsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.get("/jobs/:trackingId", async (request, reply) => {
    const userId = v1UserId(request);
    const { trackingId } = request.params as { trackingId: string };

    let snapshot = await request.server.jobProgress.getSnapshot(trackingId);
    if (!snapshot) {
      snapshot = await loadJobSnapshotFromDb(trackingId);
    }
    if (!snapshot) {
      return reply.status(404).send(apiError("not_found", "Job not found."));
    }
    if (snapshot.userId !== userId) {
      return reply.status(403).send(apiError("forbidden", "Access denied."));
    }

    const platformStatuses = snapshot.events
      .filter((e: JobProgressEvent) => e.platform)
      .map((e: JobProgressEvent) => ({
        platform: e.platform,
        connected_account_id: e.connectedAccountId ?? null,
        phase: e.phase,
        message: e.message ?? null,
      }));

    return {
      tracking_id: snapshot.trackingId,
      post_id: snapshot.postId,
      status: snapshot.status,
      total: snapshot.total,
      completed: snapshot.completed,
      failed: snapshot.failed,
      platform_statuses: platformStatuses,
      created_at: snapshot.events[0]?.ts ?? snapshot.updatedAt,
      completed_at:
        snapshot.status === "completed" || snapshot.status === "failed"
          ? snapshot.updatedAt
          : null,
    };
  });
}
