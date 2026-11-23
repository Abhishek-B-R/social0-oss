import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "../../lib/api-errors.js";
import { requireV1ApiKey } from "../../middleware/api-auth.js";
import { v1Scope } from "../../lib/v1-workspace.js";
import {
  v1BuildConnectUrl,
  v1DisconnectAccount,
  v1ListAccounts,
} from "../../services/v1-accounts.js";

const connectSchema = z.object({
  platform: z.string(),
});

export async function registerAccountsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.get("/accounts", async (request) => {
    const accounts = await v1ListAccounts(v1Scope(request));
    return { data: accounts };
  });

  app.post("/accounts/connect", async (request, reply) => {
    const body = connectSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "platform is required."));
    }
    const result = await v1BuildConnectUrl(v1Scope(request), body.data.platform);
    if (!result.ok) {
      return reply.status(400).send(apiError("validation_error", result.error));
    }
    return { authorization_url: result.authorization_url };
  });

  app.delete("/accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await v1DisconnectAccount(v1Scope(request), id);
    if (!result.ok) {
      return reply.status(404).send(apiError("not_found", result.error));
    }
    return reply.status(204).send();
  });
}
