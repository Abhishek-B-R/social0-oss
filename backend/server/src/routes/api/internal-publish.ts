import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { PublishPlatformJob } from "@social0/shared";
import { executePublish } from "../../bff/actions/publish.js";
import { loadPublicationTargets } from "../../lib/publish-load-targets.js";

function verifyInternalPublishAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const secret = process.env.CF_PUBLISH_HMAC_SECRET?.trim();
  if (!secret) {
    reply.status(503).send({ error: "CF_PUBLISH_HMAC_SECRET not configured" });
    return false;
  }
  const auth = request.headers.authorization;
  if (auth !== `Bearer ${secret}`) {
    reply.status(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

const targetsSchema = z.object({
  postId: z.string().uuid(),
  userId: z.string(),
  connectedAccountIds: z.array(z.string()).optional(),
});

const platformSchema = z.object({
  postId: z.string().uuid(),
  userId: z.string(),
  trackingId: z.string().uuid().optional(),
  publicationId: z.string().uuid(),
  connectedAccountId: z.string().uuid(),
  platform: z.string(),
});

/** Called by Cloudflare publish Worker — must stay fast; heavy work is executePublish per platform. */
export async function registerInternalPublishRoutes(app: FastifyInstance) {
  app.post("/internal/publish-targets", async (request, reply) => {
    if (!verifyInternalPublishAuth(request, reply)) return;

    const body = targetsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const targets = await loadPublicationTargets({
      postId: body.data.postId,
      userId: body.data.userId,
      connectedAccountIds: body.data.connectedAccountIds,
    });

    return reply.send(targets);
  });

  app.post("/internal/publish-platform", async (request, reply) => {
    if (!verifyInternalPublishAuth(request, reply)) return;

    const body = platformSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const job = body.data as PublishPlatformJob;
    const result = await executePublish(
      job.postId,
      job.userId,
      job.publicationId,
    );

    const pubResult = result.results?.find(
      (r) => r.connectedAccountId === job.connectedAccountId,
    );
    const ok = pubResult?.status === "published";

    if (!ok) {
      return reply.status(502).send({
        error: pubResult?.error ?? result.error ?? "Platform publish failed",
        results: result.results,
      });
    }

    return reply.send({ ok: true, results: result.results });
  });
}
