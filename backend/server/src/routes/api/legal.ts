import type { FastifyInstance } from "fastify";
import { runNextRouteHandler } from "../../lib/run-next-handler.js";
import { GET as legalStatus } from "./legal-status.js";
import { POST as legalAccept } from "./legal-accept.js";

export async function registerLegalRoutes(app: FastifyInstance) {
  app.get("/legal/status", async (req, reply) => {
    await runNextRouteHandler(req, reply, legalStatus);
  });
  app.post("/legal/accept", async (req, reply) => {
    await runNextRouteHandler(req, reply, legalAccept);
  });
}
