import type { FastifyInstance } from "fastify";
import { notImplemented } from "../../middleware/auth.js";

export async function registerWebhooksRoutes(app: FastifyInstance) {
  app.post("/webhooks/dodo", async () =>
    notImplemented("POST /api/webhooks/dodo"),
  );
}
