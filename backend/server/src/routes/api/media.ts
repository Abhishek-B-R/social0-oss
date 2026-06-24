import type { FastifyInstance } from "fastify";
import {
  accepted,
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";
import { enqueueMediaConfirm, queueNameForJob } from "../../services/enqueue.js";
import { JOB_NAMES } from "@social0/shared";

export async function registerMediaApiRoutes(app: FastifyInstance) {
  app.post("/media/presign", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("POST /api/media/presign");
  });

  app.post("/media/confirm", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    const body = (request.body ?? {}) as { mediaId?: string };
    if (!body.mediaId) {
      return reply.status(400).send({ error: "mediaId required" });
    }
    const job = await enqueueMediaConfirm(app, {
      userId,
      mediaId: body.mediaId,
    });
    return reply
      .status(202)
      .send(accepted(job.id!, queueNameForJob(JOB_NAMES.MEDIA_CONFIRM)));
  });

  app.post("/media/upload", async () =>
    notImplemented("POST /api/media/upload — deprecated"),
  );
}
