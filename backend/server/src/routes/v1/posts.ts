import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "../../lib/api-errors.js";
import {
  claimIdempotencySlot,
  getIdempotencyResponse,
  storeIdempotencyResponse,
} from "../../lib/api-idempotency.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";
import {
  v1CreateAndPublish,
  v1CreateAndSchedule,
  v1CreateDraft,
  v1DeletePost,
  v1GetPost,
  v1ListPosts,
  v1PublishPost,
  v1SchedulePost,
  v1UpdateDraft,
} from "../../services/v1-posts.js";

const createPostSchema = z.object({
  content: z.string(),
  platforms: z.array(z.string().uuid()).min(1),
  media: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updatePostSchema = createPostSchema.partial();

const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
});

async function withIdempotency(
  request: Parameters<typeof requireV1ApiKey>[0],
  reply: Parameters<typeof requireV1ApiKey>[1],
  handler: () => Promise<{ status: number; body: unknown }>,
): Promise<void> {
  const key = request.headers["idempotency-key"] as string | undefined;
  const userId = request.v1Auth?.userId;

  if (key && userId) {
    const cached = await getIdempotencyResponse(userId, key);
    if (cached) {
      reply.status(cached.statusCode).send(JSON.parse(cached.body));
      return;
    }
    const claimed = await claimIdempotencySlot(userId, key);
    if (!claimed) {
      reply
        .status(409)
        .send(apiError("idempotency_conflict", "Request with this idempotency key is in progress."));
      return;
    }
  }

  const result = await handler();
  if (key && userId && result.status < 500) {
    await storeIdempotencyResponse(userId, key, result.status, result.body);
  }
  reply.status(result.status).send(result.body);
}

export async function registerPostsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.get("/posts", async (request, reply) => {
    const userId = v1UserId(request);
    const query = request.query as Record<string, string | undefined>;
    const result = await v1ListPosts(userId, {
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      status: query.status,
      platform: query.platform,
      search: query.search,
    });
    return result;
  });

  app.post("/posts", async (request, reply) => {
    const userId = v1UserId(request);
    const body = createPostSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "Invalid request body.", { issues: body.error.flatten() }));
    }
    const result = await v1CreateDraft(userId, body.data);
    if (!result.ok) {
      return reply.status(400).send(apiError("validation_error", result.error));
    }
    return reply.status(201).send({ id: result.id });
  });

  app.get("/posts/:id", async (request, reply) => {
    const userId = v1UserId(request);
    const { id } = request.params as { id: string };
    const post = await v1GetPost(userId, id);
    if (!post) {
      return reply.status(404).send(apiError("not_found", "Post not found."));
    }
    return post;
  });

  app.patch("/posts/:id", async (request, reply) => {
    const userId = v1UserId(request);
    const { id } = request.params as { id: string };
    const body = updatePostSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "Invalid request body.", { issues: body.error.flatten() }));
    }
    const result = await v1UpdateDraft(userId, id, body.data);
    if (!result.ok) {
      const status = result.error === "Post not found" ? 404 : 400;
      return reply.status(status).send(apiError(status === 404 ? "not_found" : "validation_error", result.error));
    }
    const post = await v1GetPost(userId, id);
    return post;
  });

  app.delete("/posts/:id", async (request, reply) => {
    const userId = v1UserId(request);
    const { id } = request.params as { id: string };
    const result = await v1DeletePost(userId, id);
    if (!result.ok) {
      const status = result.error === "Post not found" ? 404 : 400;
      return reply.status(status).send(apiError(status === 404 ? "not_found" : "validation_error", result.error));
    }
    return reply.status(204).send();
  });

  app.post("/posts/:id/publish", async (request, reply) => {
    await withIdempotency(request, reply, async () => {
      const userId = v1UserId(request);
      const { id } = request.params as { id: string };
      const result = await v1PublishPost(app, userId, id);
      if (!result.ok) {
        const status = result.error.includes("not found") ? 404 : 400;
        return {
          status,
          body: apiError(status === 404 ? "not_found" : "validation_error", result.error),
        };
      }
      return {
        status: 202,
        body: {
          tracking_id: result.tracking_id,
          status: result.status,
          stream_url: result.stream_url,
        },
      };
    });
  });

  app.post("/posts/:id/schedule", async (request, reply) => {
    const userId = v1UserId(request);
    const { id } = request.params as { id: string };
    const body = scheduleSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "scheduledAt is required (ISO datetime)."));
    }
    const result = await v1SchedulePost(userId, id, body.data.scheduledAt);
    if (!result.ok) {
      const status = result.error === "Post not found" ? 404 : 400;
      return reply.status(status).send(apiError(status === 404 ? "not_found" : "validation_error", result.error));
    }
    return { post_id: id, scheduled_at: result.scheduled_at, status: "scheduled" };
  });

  app.post("/posts/publish", async (request, reply) => {
    await withIdempotency(request, reply, async () => {
      const userId = v1UserId(request);
      const body = createPostSchema.safeParse(request.body);
      if (!body.success) {
        return {
          status: 400,
          body: apiError("validation_error", "Invalid request body."),
        };
      }
      const result = await v1CreateAndPublish(app, userId, body.data);
      if (!result.ok) {
        return { status: 400, body: apiError("validation_error", result.error) };
      }
      return {
        status: 202,
        body: {
          post_id: result.post_id,
          tracking_id: result.tracking_id,
          status: "queued",
          stream_url: result.stream_url,
        },
      };
    });
  });

  app.post("/posts/schedule", async (request, reply) => {
    const userId = v1UserId(request);
    const body = createPostSchema
      .extend({ scheduledAt: z.string().datetime() })
      .safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "Invalid request body."));
    }
    const result = await v1CreateAndSchedule(userId, body.data);
    if (!result.ok) {
      return reply.status(400).send(apiError("validation_error", result.error));
    }
    return reply.status(201).send({
      post_id: result.post_id,
      scheduled_at: result.scheduled_at,
      status: "scheduled",
    });
  });
}
