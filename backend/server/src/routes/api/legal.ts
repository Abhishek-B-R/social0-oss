import type { FastifyInstance } from "fastify";
import { runRouteHandler } from "../../lib/run-route-handler.js";
import { legalStatus } from "./legal-status.js";
import { acceptLegal } from "./legal-accept.js";

export async function registerLegalRoutes(app: FastifyInstance) {
  app.get("/legal/status", async (req, reply) => {
    await runRouteHandler(req, reply, legalStatus);
  });
  app.post("/legal/accept", async (req, reply) => {
    await runRouteHandler(req, reply, acceptLegal);
  });
}
