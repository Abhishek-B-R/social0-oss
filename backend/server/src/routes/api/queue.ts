import type { FastifyInstance } from "fastify";
import {
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";

export async function registerQueueRoutes(app: FastifyInstance) {
  app.get("/queue/slots", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /api/queue/slots");
  });
  app.post("/queue/slots", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("POST /api/queue/slots");
  });
  app.patch("/queue/slots/:id", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("PATCH /api/queue/slots/:id");
  });
  app.delete("/queue/slots/:id", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("DELETE /api/queue/slots/:id");
  });
  app.get("/queue/next-slot", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /api/queue/next-slot");
  });
  app.post("/queue/add", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("POST /api/queue/add");
  });
}
