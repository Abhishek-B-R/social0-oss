import type { FastifyInstance } from "fastify";
import {
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";

export async function registerMiscRoutes(app: FastifyInstance) {
  app.get("/pinterest/boards", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /api/pinterest/boards");
  });
  app.post("/pinterest/default-board", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("POST /api/pinterest/default-board");
  });
  app.post("/account/change-email/send-otp", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("POST /api/account/change-email/send-otp");
  });
  app.post("/account/change-email", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("POST /api/account/change-email");
  });
  app.get("/canny/sso", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    return notImplemented("GET /api/canny/sso");
  });

  app.post("/dev/trigger-crons", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.status(404).send({ error: "Not found" });
    }
    const jobs = await Promise.all([
      app.queues.scheduler.add("cron.publish-scheduled", {}),
      app.queues.scheduler.add("cron.repost", {}),
      app.queues.scheduler.add("cron.autoplug", {}),
      app.queues.token.add("token.health-sweep", { sweep: true }),
    ]);
    return {
      triggered: jobs.map((j) => j.id),
    };
  });
}
