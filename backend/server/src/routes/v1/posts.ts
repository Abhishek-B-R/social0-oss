import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { apiError } from "../../lib/api-errors.js";
import { enforceRateLimit, publishLimiter } from "../../lib/ratelimit.js";
import { scheduledAtInputSchema, scheduleTimezoneSchema } from "../../lib/validation.js";
import { resolveScheduledAt } from "../../lib/resolve-scheduled-at.js";
import {
  requestFingerprint,
  runIdempotent,
  type IdempotentResult,
} from "../../lib/api-idempotency.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";
import { sendRateLimited } from "../../middleware/v1-live-limits.js";
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
import { loadPublishTimelineForOwnedPost } from "../../lib/publish-timeline.js";
import { resolveV1PostSource } from "../../lib/post-source.js";

const createPostBodySchema = z.object({
  content: z.string(),
  platforms: z.array(z.string().uuid()).min(1).optional(),
  accounts: z.array(z.string().uuid()).min(1).optional(),
  media: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.unknown()).optional(),
  platform_options: z.record(z.unknown()).optional(),
});

const createPostSchema = createPostBodySchema
  .refine((body) => body.platforms !== undefined || body.accounts !== undefined, {
    message: "platforms or accounts is required",
    path: ["platforms"],
  })
  .transform(({ accounts, platforms, ...body }) => ({
    ...body,
    platforms: platforms ?? accounts ?? [],
  }));

const updatePostSchema = z
  .object({
    content: z.string().optional(),
    platforms: z.array(z.string().uuid()).min(1).optional(),
    accounts: z.array(z.string().uuid()).min(1).optional(),
    media: z.array(z.string().uuid()).optional(),
    metadata: z.record(z.unknown()).optional(),
    platform_options: z.record(z.unknown()).optional(),
  })
  .transform(({ accounts, platforms, ...body }) => ({
    ...body,
    ...(platforms !== undefined || accounts !== undefined
      ? { platforms: platforms ?? accounts ?? [] }
      : {}),
  }));

const scheduleSchema = z.object({
  scheduledAt: scheduledAtInputSchema,
  timezone: scheduleTimezoneSchema,
});

async function withIdempotency(
  request: Parameters<typeof requireV1ApiKey>[0],
  reply: Parameters<typeof requireV1ApiKey>[1],
  scope: string,
  handler: () => Promise<IdempotentResult>,
): Promise<void> {
  const header = request.headers["idempotency-key"];
  const key = (Array.isArray(header) ? header[0] : header) || undefined;
  const userId = request.v1Auth?.userId;

  const result =
    key && userId
      ? await runIdempotent(
          { userId, idempotencyKey: key, scope, fingerprint: requestFingerprint(request.body) },
          handler,
        )
      : await handler();
  if (result.location) {
    reply.header("Location", result.location);
  }
  reply.status(result.status).send(result.body);
}

/**
 * The per-user publish budget (`publishLimiter`, 60 publish actions an hour)
 * that the dashboard RPC and `POST /api/publish` enforce, on top of the tier
 * request limit from `requireV1ApiKey`. Without it a key could fan out
 * thousands of publishes an hour through `/v1` against platform app quotas
 * every user shares.
 *
 * Unlike the other `/v1` budgets the key is not namespaced: `/api/publish`
 * already spends this bucket for API-key callers, and the cap is meant to be
 * one per user whichever door the publish comes through. It runs before the
 * idempotency layer so a 429 is never stored as a key's response.
 */
export async function requireV1PublishBudget(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const rate = await enforceRateLimit(publishLimiter, v1UserId(request));
  if (rate.allowed) return undefined;
  return sendRateLimited(reply, rate);
}

/** Nothing went out and a retry is safe: 503 is not stored under an Idempotency-Key. */
function publishFailure(result: { error: string; unavailable?: true }) {
  if (result.unavailable) {
    return { status: 503, body: apiError("internal_error", result.error) };
  }
  return null;
}

export async function registerPostsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);
  const publishBudget = { preHandler: requireV1PublishBudget };

  app.get("/posts", async (request, _reply) => {
    const userId = v1UserId(request);
    const query = request.query as Record<string, string | undefined>;
    const result = await v1ListPosts(userId, {
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      status: query.status,
      platform: query.platform,
      connectedAccountId: query.connected_account_id,
      search: query.search,
    });
    return result;
  });

  // A retried create without a key makes a second draft (or a second
  // scheduled post, which then publishes twice), so both creates take
  // Idempotency-Key like the publish routes.
  app.post("/posts", async (request, reply) => {
    await withIdempotency(request, reply, "POST /v1/posts", async () => {
      const userId = v1UserId(request);
      const body = createPostSchema.safeParse(request.body);
      if (!body.success) {
        return {
          status: 400,
          body: apiError("validation_error", "Invalid request body.", {
            issues: body.error.flatten(),
          }),
        };
      }
      const result = await v1CreateDraft(userId, body.data, {
        source: await resolveV1PostSource(request),
      });
      if (!result.ok) {
        return { status: 400, body: apiError("validation_error", result.error) };
      }
      return { status: 201, body: { id: result.id } };
    });
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

  app.get("/posts/:id/events", async (request, reply) => {
    const userId = v1UserId(request);
    const { id } = request.params as { id: string };
    const events = await loadPublishTimelineForOwnedPost(id, userId);
    if (events === null) {
      return reply.status(404).send(apiError("not_found", "Post not found."));
    }
    return {
      postId: id,
      events: events.map((e) => ({
        id: e.id,
        phase: e.phase,
        platform: e.platform,
        message: e.message,
        created_at: e.createdAt,
      })),
    };
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

  app.post("/posts/:id/publish", publishBudget, async (request, reply) => {
    const { id } = request.params as { id: string };
    await withIdempotency(request, reply, `POST /v1/posts/${id}/publish`, async () => {
      const userId = v1UserId(request);
      const result = await v1PublishPost(app, userId, id);
      if (!result.ok) {
        const unavailable = publishFailure(result);
        if (unavailable) return unavailable;
        const status = result.error.includes("not found") ? 404 : 400;
        return {
          status,
          body: apiError(status === 404 ? "not_found" : "validation_error", result.error),
        };
      }
      return {
        status: 202,
        location: `/v1/jobs/${result.tracking_id}`,
        body: {
          tracking_id: result.tracking_id,
          status: result.status,
          stream_url: result.stream_url,
          ...(result.warning ? { warning: result.warning } : {}),
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
    const at = await resolveScheduledAt(
      userId,
      body.data.scheduledAt,
      body.data.timezone,
    );
    if (!at.ok) {
      return reply.status(400).send(apiError("validation_error", at.error));
    }
    const result = await v1SchedulePost(userId, id, at.utc.toISOString());
    if (!result.ok) {
      const status = result.error === "Post not found" ? 404 : 400;
      return reply.status(status).send(apiError(status === 404 ? "not_found" : "validation_error", result.error));
    }
    return { post_id: id, scheduled_at: result.scheduled_at, status: "scheduled" };
  });

  app.post("/posts/publish", publishBudget, async (request, reply) => {
    await withIdempotency(request, reply, "POST /v1/posts/publish", async () => {
      const userId = v1UserId(request);
      const body = createPostSchema.safeParse(request.body);
      if (!body.success) {
        return {
          status: 400,
          body: apiError("validation_error", "Invalid request body."),
        };
      }
      const result = await v1CreateAndPublish(app, userId, body.data, {
        source: await resolveV1PostSource(request),
      });
      if (!result.ok) {
        return (
          publishFailure(result) ?? {
            status: 400,
            body: apiError("validation_error", result.error),
          }
        );
      }
      return {
        status: 202,
        location: `/v1/jobs/${result.tracking_id}`,
        body: {
          post_id: result.post_id,
          tracking_id: result.tracking_id,
          status: "queued",
          stream_url: result.stream_url,
          ...(result.warning ? { warning: result.warning } : {}),
        },
      };
    });
  });

  app.post("/posts/schedule", async (request, reply) => {
    await withIdempotency(request, reply, "POST /v1/posts/schedule", () =>
      createAndSchedule(request),
    );
  });
}

async function createAndSchedule(request: FastifyRequest): Promise<IdempotentResult> {
  const userId = v1UserId(request);
  const body = createPostBodySchema
    .extend({
      scheduledAt: scheduledAtInputSchema,
      timezone: scheduleTimezoneSchema,
    })
    .refine((value) => value.platforms !== undefined || value.accounts !== undefined, {
      message: "platforms or accounts is required",
      path: ["platforms"],
    })
    .transform(({ accounts, platforms, ...value }) => ({
      ...value,
      platforms: platforms ?? accounts ?? [],
    }))
    .safeParse(request.body);
  if (!body.success) {
    return { status: 400, body: apiError("validation_error", "Invalid request body.") };
  }
  const at = await resolveScheduledAt(
    userId,
    body.data.scheduledAt,
    body.data.timezone,
  );
  if (!at.ok) {
    return { status: 400, body: apiError("validation_error", at.error) };
  }
  const result = await v1CreateAndSchedule(
    userId,
    {
      ...body.data,
      scheduledAt: at.utc.toISOString(),
    },
    { source: await resolveV1PostSource(request) },
  );
  if (!result.ok) {
    return { status: 400, body: apiError("validation_error", result.error) };
  }
  return {
    status: 201,
    body: {
      post_id: result.post_id,
      scheduled_at: result.scheduled_at,
      status: "scheduled",
    },
  };
}
