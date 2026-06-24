import type { FastifyInstance } from "fastify";
import {
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";

export async function registerPostResultsRoutes(app: FastifyInstance) {
  app.get("/post-results", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /v1/post-results");
  });
}
