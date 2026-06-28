import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";

const presignSchema = z.object({
  name: z.string(),
  mime_type: z.enum([
    "image/png",
    "image/jpeg",
    "video/mp4",
    "video/quicktime",
  ]),
  size_bytes: z.number().positive(),
});

export async function registerMediaRoutes(app: FastifyInstance) {
  app.get("/media", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /v1/media");
  });

  app.post("/media/upload-url", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    const body = presignSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }
    return notImplemented("POST /v1/media/upload-url");
  });

  app.post("/media/:id/confirm", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    const { id: mediaId } = request.params as { id: string };
    return reply.status(200).send({ ok: true, mediaId });
  });
}
