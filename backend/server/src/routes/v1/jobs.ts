import type { FastifyInstance } from "fastify";
import { apiError } from "../../lib/api-errors.js";
import { admitJobStream, openJobSseStream } from "../../lib/job-sse-stream.js";
import { resolveJobSnapshot } from "../../lib/resolve-job-snapshot.js";
import {
  formatV1JobResponse,
  formatV1StreamEvent,
} from "../../lib/v1-job-format.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";
import { v1Scope } from "../../lib/v1-workspace.js";
import { sendRateLimited } from "../../middleware/v1-live-limits.js";

export async function registerJobsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.get("/jobs/:trackingId", async (request, reply) => {
    // Jobs carry the post owner, which is the workspace owner inside a workspace.
    const { userId } = v1Scope(request);
    const { trackingId } = request.params as { trackingId: string };

    const snapshot = await resolveJobSnapshot(request.server, trackingId);
    if (!snapshot) {
      return reply.status(404).send(apiError("not_found", "Job not found."));
    }
    if (snapshot.userId !== userId) {
      return reply.status(403).send(apiError("forbidden", "Access denied."));
    }

    return formatV1JobResponse(snapshot);
  });

  app.get("/jobs/:trackingId/stream", async (request, reply) => {
    const { userId } = v1Scope(request);
    const { trackingId } = request.params as { trackingId: string };

    const snapshot = await resolveJobSnapshot(request.server, trackingId);
    if (!snapshot) {
      return reply.status(404).send(apiError("not_found", "Job not found."));
    }
    if (snapshot.userId !== userId) {
      return reply.status(403).send(apiError("forbidden", "Access denied."));
    }

    // The hourly tier limit counts a 15-minute stream as one request; cap
    // opens and concurrent streams like the dashboard does (keys `v1:`).
    const actorId = v1UserId(request);
    const admit = await admitJobStream(actorId, `v1:jobstream:${actorId}`);
    if (!admit.allowed) return sendRateLimited(reply, admit);

    await openJobSseStream(
      request,
      reply,
      request.server,
      trackingId,
      snapshot,
      {
        formatEvent: formatV1StreamEvent,
        formatDone: formatV1JobResponse,
        release: admit.release,
      },
    );
  });
}
