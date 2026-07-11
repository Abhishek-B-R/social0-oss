import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "../../lib/api-errors.js";
import { loadJobSnapshotFromDb } from "../../lib/job-snapshot-from-db.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";
import { v1ConfirmMedia, v1GetMedia, v1PresignMedia } from "../../services/v1-media.js";

const presignSchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().min(1),
  size_bytes: z.number().positive(),
});

const confirmSchema = z.object({
  key: z.string().min(1),
  storage_filename: z.string().min(1),
  original_filename: z.string().min(1),
  content_type: z.string().min(1),
  size_bytes: z.number().positive(),
});

export async function registerMediaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.post("/media/presign", async (request, reply) => {
    const userId = v1UserId(request);
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

  app.post("/media/confirm", async (request, reply) => {
    const userId = v1UserId(request);
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
    const userId = v1UserId(request);
    const { id } = request.params as { id: string };
    const media = await v1GetMedia(userId, id);
    if (!media) {
      return reply.status(404).send(apiError("not_found", "Media not found."));
    }
    return media;
  });
}
