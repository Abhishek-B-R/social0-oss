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
import { v1Scope } from "../../lib/v1-workspace.js";
import {
  v1BulkDeletePosts,
  v1CancelAutoPlug,
  v1DisableAutoRepost,
  v1DuplicatePost,
  v1PostAgain,
  v1SetAutoPlug,
  v1SetAutoRepost,
} from "../../services/v1-post-actions.js";
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
import { POSTS_BATCH_MAX } from "../../services/posts.js";

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

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(POSTS_BATCH_MAX),
});

const autoPlugSchema = z.object({
  metric: z.enum(["likes", "retweets"]),
  threshold: z.number().int().min(1).max(10_000_000),
  message: z.string().trim().min(1).max(280),
  account_id: z.string().uuid().optional(),
});

const autoRepostSchema = z.object({
  interval_hours: z.number().min(0.5).max(720).optional(),
  max_reposts: z.number().int().min(1).max(10).optional(),
  message: z.string().max(280).nullable().optional(),
  active: z.boolean().optional(),
});

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
  // A key reused in another workspace is a different request, not a replay.
  const workspaceId = request.v1Workspace?.workspaceId;

  const result =
    key && userId
      ? await runIdempotent(
          {
            userId,
            idempotencyKey: key,
            scope: workspaceId ? `${scope} @${workspaceId}` : scope,
            fingerprint: requestFingerprint(request.body),
          },
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
    const query = request.query as Record<string, string | undefined>;
    const result = await v1ListPosts(v1Scope(request), {
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
      const body = createPostSchema.safeParse(request.body);
      if (!body.success) {
        return {
          status: 400,
          body: apiError("validation_error", "Invalid request body.", {
            issues: body.error.flatten(),
          }),
        };
      }
      const result = await v1CreateDraft(v1Scope(request), body.data, {
        source: await resolveV1PostSource(request),
      });
      if (!result.ok) {
        return { status: 400, body: apiError("validation_error", result.error) };
      }
      return { status: 201, body: { id: result.id } };
    });
  });

  app.get("/posts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await v1GetPost(v1Scope(request), id);
    if (!post) {
      return reply.status(404).send(apiError("not_found", "Post not found."));
    }
    return post;
  });

  app.get("/posts/:id/events", async (request, reply) => {
    const { userId, workspaceId } = v1Scope(request);
    const { id } = request.params as { id: string };
    const events = await loadPublishTimelineForOwnedPost(id, userId, workspaceId);
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
    const scope = v1Scope(request);
    const { id } = request.params as { id: string };
    const body = updatePostSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "Invalid request body.", { issues: body.error.flatten() }));
    }
    const result = await v1UpdateDraft(scope, id, body.data);
    if (!result.ok) {
      const status = result.error === "Post not found" ? 404 : 400;
      return reply.status(status).send(apiError(status === 404 ? "not_found" : "validation_error", result.error));
    }
    const post = await v1GetPost(scope, id);
    return post;
  });

  app.delete("/posts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await v1DeletePost(v1Scope(request), id);
    if (!result.ok) {
      const status = result.error === "Post not found" ? 404 : 400;
      return reply.status(status).send(apiError(status === 404 ? "not_found" : "validation_error", result.error));
    }
    return reply.status(204).send();
  });

  app.post("/posts/:id/publish", publishBudget, async (request, reply) => {
    const { id } = request.params as { id: string };
    await withIdempotency(request, reply, `POST /v1/posts/${id}/publish`, async () => {
      const result = await v1PublishPost(app, v1Scope(request), id);
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
    const result = await v1SchedulePost(v1Scope(request), id, at.utc.toISOString());
    if (!result.ok) {
      const status = result.error === "Post not found" ? 404 : 400;
      return reply.status(status).send(apiError(status === 404 ? "not_found" : "validation_error", result.error));
    }
    return { post_id: id, scheduled_at: result.scheduled_at, status: "scheduled" };
  });

  app.post("/posts/publish", publishBudget, async (request, reply) => {
    await withIdempotency(request, reply, "POST /v1/posts/publish", async () => {
      const body = createPostSchema.safeParse(request.body);
      if (!body.success) {
        return {
          status: 400,
          body: apiError("validation_error", "Invalid request body."),
        };
      }
      const result = await v1CreateAndPublish(app, v1Scope(request), body.data, {
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

  app.post("/posts/bulk-delete", async (request, reply) => {
    const body = bulkDeleteSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", `ids must be 1 to ${POSTS_BATCH_MAX} post ids.`));
    }
    return v1BulkDeletePosts(v1Scope(request), body.data.ids);
  });

  app.post("/posts/:id/duplicate", async (request, reply) => {
    const { id } = request.params as { id: string };
    await withIdempotency(request, reply, `POST /v1/posts/${id}/duplicate`, async () => {
      const result = await v1DuplicatePost(v1Scope(request), id, {
        source: await resolveV1PostSource(request),
      });
      if (!result.ok) return failure(result.error);
      return { status: 201, body: { id: result.id } };
    });
  });

  app.post("/posts/:id/post-again", publishBudget, async (request, reply) => {
    const { id } = request.params as { id: string };
    await withIdempotency(request, reply, `POST /v1/posts/${id}/post-again`, async () => {
      const result = await v1PostAgain(request.v1Workspace!, id);
      if (!result.ok) return failure(result.error);
      const { ok: _ok, ...body } = result;
      return {
        status: 202,
        ...(body.tracking_id ? { location: `/v1/jobs/${body.tracking_id}` } : {}),
        body,
      };
    });
  });

  app.put("/posts/:id/auto-plug", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = autoPlugSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "metric, threshold and message are required.", { issues: body.error.flatten() }));
    }
    const result = await v1SetAutoPlug(request.v1Workspace!, id, body.data);
    return send(reply, result.ok ? { status: result.created ? 201 : 200, body: { post_id: id, auto_plug: "watching" } } : failure(result.error));
  });

  app.delete("/posts/:id/auto-plug", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await v1CancelAutoPlug(request.v1Workspace!, id);
    return result.ok ? reply.status(204).send() : send(reply, failure(result.error));
  });

  app.put("/posts/:id/auto-repost", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = autoRepostSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "Invalid request body.", { issues: body.error.flatten() }));
    }
    const result = await v1SetAutoRepost(request.v1Workspace!, id, body.data);
    return send(
      reply,
      result.ok
        ? { status: result.created ? 201 : 200, body: { post_id: id, schedule_id: result.schedule_id } }
        : failure(result.error),
    );
  });

  app.delete("/posts/:id/auto-repost", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await v1DisableAutoRepost(request.v1Workspace!, id);
    return result.ok ? reply.status(204).send() : send(reply, failure(result.error));
  });
}

/** 404 for a missing post, 400 for anything else the core refused. */
function failure(error: string): IdempotentResult {
  const notFound = /not found|^No (active )?Auto-/i.test(error);
  return {
    status: notFound ? 404 : 400,
    body: apiError(notFound ? "not_found" : "validation_error", error),
  };
}

function send(reply: FastifyReply, result: IdempotentResult) {
  return reply.status(result.status).send(result.body);
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
    v1Scope(request),
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
