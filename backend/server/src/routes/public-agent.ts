import type { FastifyInstance } from "fastify";
import { API_CATALOG_LINKSET } from "../lib/api-catalog.js";

export async function registerPublicAgentRoutes(app: FastifyInstance) {
  app.get("/.well-known/api-catalog", async (_request, reply) => {
    return reply
      .header("cache-control", "public, max-age=300")
      .type('application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"')
      .send(API_CATALOG_LINKSET);
  });
}
