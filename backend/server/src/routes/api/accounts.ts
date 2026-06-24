import type { FastifyInstance } from "fastify";
import {
  accepted,
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";
import {
  enqueueTokenRefresh,
  queueNameForJob,
} from "../../services/enqueue.js";
import { JOB_NAMES } from "@social0/shared";

export async function registerAccountsRoutes(app: FastifyInstance) {
  app.get("/accounts", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /api/accounts");
  });

  app.delete("/accounts/:id", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("DELETE /api/accounts/:id");
  });

  app.post("/accounts/refresh-premium", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    const body = (request.body ?? {}) as {
      connectedAccountId?: string;
      platform?: string;
    };
    if (!body.connectedAccountId || !body.platform) {
      return reply.status(400).send({ error: "connectedAccountId and platform required" });
    }
    const job = await enqueueTokenRefresh(app, {
      userId,
      connectedAccountId: body.connectedAccountId,
      platform: body.platform as never,
    });
    return reply
      .status(202)
      .send(accepted(job.id!, queueNameForJob(JOB_NAMES.TOKEN_REFRESH)));
  });
}
