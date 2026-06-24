import type { FastifyInstance } from "fastify";
import {
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";

export async function registerSocialAccountsRoutes(app: FastifyInstance) {
  app.get("/social-accounts", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /v1/social-accounts");
  });

  app.delete("/social-accounts/:id", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("DELETE /v1/social-accounts/:id");
  });
}
