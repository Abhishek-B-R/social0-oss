import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserId, unauthorized } from "../../middleware/auth.js";
import { enforceRateLimit, publishLimiter } from "../../lib/ratelimit.js";
import { scheduledAtInputSchema, scheduleTimezoneSchema } from "../../lib/validation.js";
import { resolveScheduledAt } from "../../lib/resolve-scheduled-at.js";
import {
  createPublishTrackingId,
  enqueuePublishPost,
  queueNameForJob,
} from "../../services/enqueue.js";
import { openJobSseStream } from "../../lib/job-sse-stream.js";
import { resolveJobSnapshot } from "../../lib/resolve-job-snapshot.js";

const publishSchema = z
  .object({
    postId: z.string(),
    connectedAccountIds: z.array(z.string()).optional(),
    /** ISO datetime — UTC, offset, +default, or naive with timezone */
    scheduledAt: scheduledAtInputSchema.optional(),
    timezone: scheduleTimezoneSchema,
    /** Explicit mode override. */
    mode: z.enum(["now", "schedule"]).optional(),
  })
  .refine((d) => !(d.mode === "schedule" && !d.scheduledAt), {
    message: "scheduledAt required when mode is schedule",
    path: ["scheduledAt"],
  });

function isScheduleRequest(data: z.infer<typeof publishSchema>) {
  if (data.mode === "schedule") return true;
  if (data.mode === "now") return false;
  return Boolean(
    data.scheduledAt && new Date(data.scheduledAt).getTime() > Date.now(),
  );
}

export async function registerPublishRoutes(app: FastifyInstance) {
  app.post("/publish", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(publishLimiter, userId);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const body = publishSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const schedule = isScheduleRequest(body.data);

    if (schedule) {
      const resolved = await resolveScheduledAt(
        userId,
        body.data.scheduledAt!,
        body.data.timezone,
      );
      if (!resolved.ok) {
        return reply.status(400).send({ error: resolved.error });
      }
      const scheduledAt = resolved.utc.toISOString();
      const delay = Math.max(0, resolved.utc.getTime() - Date.now());

      const dispatched = await enqueuePublishPost(
        app,
        {
          postId: body.data.postId,
          userId,
          connectedAccountIds: body.data.connectedAccountIds,
        },
        { delay },
      );

      return reply.status(200).send({
        status: "scheduled",
        postId: body.data.postId,
        scheduledAt,
        jobId: dispatched.id,
        backend: dispatched.backend,
        message: "Post scheduled successfully",
      });
    }

    const trackingId = createPublishTrackingId();

    let dispatched;
    try {
      dispatched = await enqueuePublishPost(
        app,
        {
          postId: body.data.postId,
          userId,
          trackingId,
          connectedAccountIds: body.data.connectedAccountIds,
        },
        { trackingId },
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to enqueue publish";
      if (message.includes("No publication targets")) {
        return reply.status(404).send({ error: "Post not found or not publishable" });
      }
      throw err;
    }

    if (dispatched.enqueued === 0) {
      return reply.status(404).send({ error: "Post not found or not publishable" });
    }

    return reply.status(202).send({
      trackingId,
      jobId: dispatched.id,
      status: "queued",
      backend: dispatched.backend,
      enqueued: dispatched.enqueued,
      queue: queueNameForJob("now"),
      streamUrl: `/api/jobs/${trackingId}/stream`,
    });
  });
}

export async function registerJobRoutes(app: FastifyInstance) {
  app.get("/jobs/:trackingId", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const { trackingId } = request.params as { trackingId: string };
    const snapshot = await resolveJobSnapshot(app, trackingId);
    if (!snapshot) {
      return reply.status(404).send({ error: "Job not found", trackingId });
    }
    if (snapshot.userId !== userId) {
      return reply.status(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }
    return snapshot;
  });

  app.get("/jobs/:trackingId/stream", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const { trackingId } = request.params as { trackingId: string };
    const snapshot = await resolveJobSnapshot(app, trackingId);
    if (!snapshot) {
      return reply.status(404).send({ error: "Job not found", trackingId });
    }
    if (snapshot.userId !== userId) {
      return reply.status(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    await openJobSseStream(request, reply, app, trackingId, snapshot);
  });
}
