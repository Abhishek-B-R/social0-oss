import type { FastifyInstance } from "fastify";
import { runRouteHandler, type RouteHandler } from "../../lib/run-route-handler.js";
import {
  listQueueSlots,
  createQueueSlot,
} from "../../handlers/queue/slots.js";
import {
  updateQueueSlot,
  deleteQueueSlot,
} from "../../handlers/queue/slots-id.js";
import { getNextQueueSlot } from "../../handlers/queue/next-slot.js";
import { addToQueue } from "../../handlers/queue/add.js";

export async function registerQueueRoutes(app: FastifyInstance) {
  app.get("/queue/slots", async (req, reply) => {
    await runRouteHandler(req, reply, listQueueSlots);
  });
  app.post("/queue/slots", async (req, reply) => {
    await runRouteHandler(req, reply, createQueueSlot);
  });
  app.patch("/queue/slots/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await runRouteHandler(req, reply, updateQueueSlot as unknown as RouteHandler, {
      id,
    });
  });
  app.delete("/queue/slots/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await runRouteHandler(req, reply, deleteQueueSlot as unknown as RouteHandler, {
      id,
    });
  });
  app.get("/queue/next-slot", async (req, reply) => {
    await runRouteHandler(req, reply, getNextQueueSlot);
  });
  app.post("/queue/add", async (req, reply) => {
    await runRouteHandler(req, reply, addToQueue);
  });
}
