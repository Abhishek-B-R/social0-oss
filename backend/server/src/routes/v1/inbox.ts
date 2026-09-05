import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "../../lib/api-errors.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";
import {
  requireV1LiveReadBudget,
  requireV1MutationBudget,
} from "../../middleware/v1-live-limits.js";
import { WINDOW_PRESETS } from "../../lib/date-window.js";
import { isPlatformLive } from "../../lib/live-platforms.js";
import { PLATFORMS } from "../../lib/platforms.js";
import {
  v1GetInboxDmThread,
  v1HideInboxComment,
  v1LikeInboxComment,
  v1ListInboxAccounts,
  v1ListInboxComments,
  v1ListInboxDms,
  v1ReplyToInboxComment,
  v1ReplyToInboxDm,
} from "../../services/v1-inbox.js";

/** `?fresh=1` bypasses warm cache (still subject to the soft-fresh floor). */
const boolish = z
  .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
  .transform((v) => v === true || v === "1" || v === "true");

const platformIds = PLATFORMS.map((p) => p.id) as [string, ...string[]];

const listQuerySchema = z.object({
  account_id: z.string().uuid().optional(),
  platform: z.enum(platformIds).optional(),
  range: z.enum([...WINDOW_PRESETS, "custom"]).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(24).optional(),
  fresh: boolish.optional(),
});

const accountsQuerySchema = z.object({
  mode: z.enum(["comments", "dms"]).default("comments"),
});

const dmThreadQuerySchema = z.object({
  account_id: z.string().uuid(),
  peer_id: z.string().optional(),
  fresh: boolish.optional(),
});

const replyCommentSchema = z.object({
  publication_id: z.string().uuid(),
  text: z.string().optional(),
  media_id: z.string().uuid().optional(),
});

const likeCommentSchema = z.object({
  publication_id: z.string().uuid(),
  unlike: z.boolean().optional(),
});

const hideCommentSchema = z.object({
  publication_id: z.string().uuid(),
});

const replyDmSchema = z.object({
  account_id: z.string().uuid(),
  peer_id: z.string().optional(),
  text: z.string().optional(),
  media_id: z.string().uuid().optional(),
});

function invalid(reply: Parameters<typeof requireV1ApiKey>[1], error: z.ZodError) {
  const issue = error.issues[0];
  const path = issue?.path.join(".") ?? "input";
  return reply
    .status(400)
    .send(
      apiError(
        "validation_error",
        `${path}: ${issue?.message ?? "Invalid request."}`,
      ),
    );
}

/**
 * Inbox mutations return `{ ok: false, error }` for expected platform-side
 * failures (comment not on this post, missing scope, unsupported network).
 * Map those to 400 so API clients can branch on status, not string matching.
 */
function mutationReply(
  reply: Parameters<typeof requireV1ApiKey>[1],
  result: { ok: true; replyId?: string; messageId?: string } | { ok: false; error: string },
) {
  if (!result.ok) {
    return reply.status(400).send(apiError("validation_error", result.error));
  }
  return {
    ok: true as const,
    ...(result.replyId ? { reply_id: result.replyId } : {}),
    ...(result.messageId ? { message_id: result.messageId } : {}),
  };
}

export async function registerInboxRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  // Live reads fan out to platform APIs and mutations verify against a live
  // read before sending; gate both like the dashboard RPC does.
  const live = { preHandler: requireV1LiveReadBudget };
  const mutation = { preHandler: requireV1MutationBudget };

  app.get("/inbox/accounts", async (request, reply) => {
    const userId = v1UserId(request);
    const query = accountsQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return invalid(reply, query.error);
    return { data: await v1ListInboxAccounts(userId, query.data.mode) };
  });

  app.get("/inbox/comments", live, async (request, reply) => {
    const userId = v1UserId(request);
    const query = listQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return invalid(reply, query.error);
    // The rollout gate is backend-only (LIVE_PLATFORMS); a platform that is
    // still off must not be reachable by naming it in the query.
    if (query.data.platform && !isPlatformLive("inboxComments", query.data.platform)) {
      return reply.status(400).send(
        apiError(
          "validation_error",
          `platform: Comments are not available yet for ${query.data.platform}. See GET /v1/inbox/accounts for networks with a live inbox.`,
        ),
      );
    }
    return v1ListInboxComments(userId, query.data);
  });

  app.post("/inbox/comments/:commentId/reply", mutation, async (request, reply) => {
    const userId = v1UserId(request);
    const { commentId } = request.params as { commentId: string };
    const body = replyCommentSchema.safeParse(request.body ?? {});
    if (!body.success) return invalid(reply, body.error);
    const result = await v1ReplyToInboxComment(userId, {
      publication_id: body.data.publication_id,
      comment_id: commentId,
      text: body.data.text,
      media_id: body.data.media_id,
    });
    return mutationReply(reply, result);
  });

  app.post("/inbox/comments/:commentId/like", mutation, async (request, reply) => {
    const userId = v1UserId(request);
    const { commentId } = request.params as { commentId: string };
    const body = likeCommentSchema.safeParse(request.body ?? {});
    if (!body.success) return invalid(reply, body.error);
    const result = await v1LikeInboxComment(userId, {
      publication_id: body.data.publication_id,
      comment_id: commentId,
      unlike: body.data.unlike,
    });
    return mutationReply(reply, result);
  });

  app.post("/inbox/comments/:commentId/hide", mutation, async (request, reply) => {
    const userId = v1UserId(request);
    const { commentId } = request.params as { commentId: string };
    const body = hideCommentSchema.safeParse(request.body ?? {});
    if (!body.success) return invalid(reply, body.error);
    const result = await v1HideInboxComment(userId, {
      publication_id: body.data.publication_id,
      comment_id: commentId,
    });
    return mutationReply(reply, result);
  });

  app.get("/inbox/dms", live, async (request, reply) => {
    const userId = v1UserId(request);
    const query = listQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return invalid(reply, query.error);
    return v1ListInboxDms(userId, query.data);
  });

  app.get("/inbox/dms/:conversationId", live, async (request, reply) => {
    const userId = v1UserId(request);
    const { conversationId } = request.params as { conversationId: string };
    const query = dmThreadQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return invalid(reply, query.error);
    const result = await v1GetInboxDmThread(userId, {
      account_id: query.data.account_id,
      conversation_id: conversationId,
      peer_id: query.data.peer_id,
      fresh: query.data.fresh,
    });
    if (!result.ok) {
      if (result.code === "not_found") {
        return reply.status(404).send(apiError("not_found", result.error));
      }
      // Unsupported network, bad input, or the platform read failed - the
      // conversation may well exist, so do not report it as missing.
      return reply
        .status(400)
        .send(apiError("validation_error", result.error));
    }
    return result.data;
  });

  app.post("/inbox/dms/:conversationId/reply", mutation, async (request, reply) => {
    const userId = v1UserId(request);
    const { conversationId } = request.params as { conversationId: string };
    const body = replyDmSchema.safeParse(request.body ?? {});
    if (!body.success) return invalid(reply, body.error);
    const result = await v1ReplyToInboxDm(userId, {
      account_id: body.data.account_id,
      conversation_id: conversationId,
      peer_id: body.data.peer_id,
      text: body.data.text,
      media_id: body.data.media_id,
    });
    return mutationReply(reply, result);
  });
}
