import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { apiError } from "../../lib/api-errors.js";
import { enforceRateLimit, uploadLimiter } from "../../lib/ratelimit.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";
import { v1Scope } from "../../lib/v1-workspace.js";
import { sendRateLimited } from "../../middleware/v1-live-limits.js";
import { v1ConfirmMedia, v1GetMedia, v1PresignMedia } from "../../services/v1-media.js";

const presignSchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
});

const confirmSchema = z.object({
  key: z.string().min(1),
  storage_filename: z.string().min(1),
  original_filename: z.string().min(1),
  content_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
});

/**
 * The same hourly upload budget the dashboard's `/api/media/*` routes use
 * (`uploadLimiter`), on top of the tier limit from `requireV1ApiKey`. Each
 * presign mints a URL for up to 500 MB of storage. Keys are namespaced `v1:`
 * like the other `/v1` budgets, so a CLI loop cannot starve the dashboard.
 */
async function requireV1UploadBudget(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const rate = await enforceRateLimit(
    uploadLimiter,
    `v1:upload:${v1UserId(request)}`,
  );
  if (rate.allowed) return undefined;
  return sendRateLimited(reply, rate);
}

export async function registerMediaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);
  const upload = { preHandler: requireV1UploadBudget };

  app.post("/media/presign", upload, async (request, reply) => {
    // Uploads belong to the workspace owner, as on the dashboard.
    const { userId } = v1Scope(request);
    const body = presignSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "Invalid request body."));
    }
    const result = await v1PresignMedia(userId, {
      filename: body.data.filename,
      content_type: body.data.content_type,
      size_bytes: body.data.size_bytes,
    });
    if (!result.ok) {
      return reply.status(400).send(apiError("validation_error", result.error));
    }
    return {
      upload_url: result.upload_url,
      key: result.key,
      storage_filename: result.storage_filename,
    };
  });

  app.post("/media/confirm", upload, async (request, reply) => {
    const { userId } = v1Scope(request);
    const body = confirmSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "Invalid request body."));
    }
    const result = await v1ConfirmMedia(userId, body.data);
    if (!result.ok) {
      return reply.status(400).send(apiError("validation_error", result.error));
    }
    return reply.status(201).send({ id: result.id, url: result.url });
  });

  app.get("/media/:id", async (request, reply) => {
    const { userId } = v1Scope(request);
    const { id } = request.params as { id: string };
    const media = await v1GetMedia(userId, id);
    if (!media) {
      return reply.status(404).send(apiError("not_found", "Media not found."));
    }
    return media;
  });
}
