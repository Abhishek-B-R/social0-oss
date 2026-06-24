import type { FastifyInstance } from "fastify";
import { runNextRouteHandler, type NextRouteHandler } from "../../lib/run-next-handler.js";
import * as slots from "../handlers/queue/slots.js";
import * as slotsId from "../handlers/queue/slots-id.js";
import * as nextSlot from "../handlers/queue/next-slot.js";
import * as add from "../handlers/queue/add.js";

export async function registerQueueRoutes(app: FastifyInstance) {
  app.get("/queue/slots", async (req, reply) => {
    await runNextRouteHandler(req, reply, slots.GET);
  });
  app.post("/queue/slots", async (req, reply) => {
    await runNextRouteHandler(req, reply, slots.POST);
  });
  app.patch("/queue/slots/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await runNextRouteHandler(
      req,
      reply,
      slotsId.PATCH as unknown as NextRouteHandler,
      { id },
    );
  });
  app.delete("/queue/slots/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await runNextRouteHandler(
      req,
      reply,
      slotsId.DELETE as unknown as NextRouteHandler,
      { id },
    );
  });
  app.get("/queue/next-slot", async (req, reply) => {
    await runNextRouteHandler(req, reply, nextSlot.GET);
  });
  app.post("/queue/add", async (req, reply) => {
    await runNextRouteHandler(req, reply, add.POST);
  });
}
