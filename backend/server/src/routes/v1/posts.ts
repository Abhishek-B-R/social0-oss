import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";
import {
  createPublishTrackingId,
  enqueuePublishPost,
  queueNameForJob,
} from "../../services/enqueue.js";
import { JOB_NAMES } from "@social0/shared";

const createPostSchema = z.object({
  caption: z.string(),
  social_accounts: z.array(z.number()),
  scheduled_at: z.string().nullable().optional(),
  platform_configurations: z.record(z.unknown()).nullable().optional(),
  account_configurations: z.record(z.unknown()).nullable().optional(),
  media: z.array(z.string()).nullable().optional(),
  media_urls: z.array(z.string()).nullable().optional(),
  is_draft: z.boolean().nullable().optional(),
});

export async function registerPostsRoutes(app: FastifyInstance) {
  app.get("/posts", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /v1/posts");
  });

  app.post("/posts", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    const body = createPostSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }
    return notImplemented("POST /v1/posts");
  });

  app.get("/posts/:id", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /v1/posts/:id");
  });

  app.patch("/posts/:id", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("PATCH /v1/posts/:id");
  });

  app.delete("/posts/:id", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("DELETE /v1/posts/:id");
  });

  /** Publish now - async via queue + SSE tracking. */
  app.post("/posts/:id/publish", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());
    const { id: postId } = request.params as { id: string };

    const trackingId = createPublishTrackingId();

    let job;
    try {
      job = await enqueuePublishPost(
        app,
        { postId, userId, trackingId },
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

    if (job.enqueued === 0) {
      return reply.status(404).send({ error: "Post not found or not publishable" });
    }

    return reply.status(202).send({
      trackingId,
      jobId: job.id!,
      status: "queued",
      queue: queueNameForJob(JOB_NAMES.PUBLISH_POST),
      streamUrl: `/api/jobs/${trackingId}/stream`,
    });
  });
}
