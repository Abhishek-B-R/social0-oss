import type { FastifyInstance } from "fastify";
import { runNextRouteHandler } from "../../lib/run-next-handler.js";
import * as pinterestBoards from "../handlers/pinterest/boards.js";
import * as pinterestDefaultBoard from "../handlers/pinterest/default-board.js";
import * as changeEmailSendOtp from "../handlers/account/change-email-send-otp.js";
import * as changeEmail from "../handlers/account/change-email.js";
import * as cannySso from "../handlers/canny/sso.js";
import { JOB_NAMES } from "@social0/shared";

export async function registerMiscRoutes(app: FastifyInstance) {
  app.get("/pinterest/boards", async (req, reply) => {
    await runNextRouteHandler(req, reply, pinterestBoards.GET);
  });
  app.put("/pinterest/default-board", async (req, reply) => {
    await runNextRouteHandler(req, reply, pinterestDefaultBoard.PUT);
  });
  app.post("/account/change-email/send-otp", async (req, reply) => {
    await runNextRouteHandler(req, reply, changeEmailSendOtp.POST);
  });
  app.post("/account/change-email", async (req, reply) => {
    await runNextRouteHandler(req, reply, changeEmail.POST);
  });
  app.get("/canny/sso", async (req, reply) => {
    await runNextRouteHandler(req, reply, cannySso.GET);
  });

  app.post("/dev/trigger-crons", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.status(404).send({ error: "Not found" });
    }
    const jobs = await Promise.all([
      request.server.queues.scheduler.add(JOB_NAMES.CRON_PUBLISH_SCHEDULED, {}),
      request.server.queues.scheduler.add(JOB_NAMES.CRON_REPOST, {}),
      request.server.queues.scheduler.add(JOB_NAMES.CRON_AUTOPLUG, {}),
      request.server.queues.token.add(JOB_NAMES.TOKEN_HEALTH_SWEEP, {
        sweep: true,
      }),
    ]);
    return {
      triggered: jobs.map((j) => j.id),
    };
  });
}
