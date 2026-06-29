import type { FastifyInstance } from "fastify";
import { runRouteHandler } from "../../lib/run-route-handler.js";
import { verifyCronSecretFromAuthorizationHeader } from "../../lib/cron-auth.js";
import { enqueueCronJob } from "../../services/enqueue.js";
import { JOB_NAMES } from "@social0/shared";
import {
  listPinterestBoards,
  savePinterestBoard,
} from "../../handlers/pinterest/boards.js";
import { setDefaultPinterestBoard } from "../../handlers/pinterest/default-board.js";
import { sendChangeEmailOtp } from "../../handlers/account/change-email-send-otp.js";
import { changeEmail } from "../../handlers/account/change-email.js";
import { cannySso } from "../../handlers/canny/sso.js";
import { cannyConfig } from "../../handlers/canny/config.js";

export async function registerMiscRoutes(app: FastifyInstance) {
  app.get("/pinterest/boards", async (req, reply) => {
    await runRouteHandler(req, reply, listPinterestBoards);
  });
  app.post("/pinterest/boards", async (req, reply) => {
    await runRouteHandler(req, reply, savePinterestBoard);
  });
  app.put("/pinterest/default-board", async (req, reply) => {
    await runRouteHandler(req, reply, setDefaultPinterestBoard);
  });
  app.post("/account/change-email/send-otp", async (req, reply) => {
    await runRouteHandler(req, reply, sendChangeEmailOtp);
  });
  app.post("/account/change-email", async (req, reply) => {
    await runRouteHandler(req, reply, changeEmail);
  });
  app.get("/canny/sso", async (req, reply) => {
    await runRouteHandler(req, reply, cannySso);
  });
  app.get("/canny/config", async (req, reply) => {
    await runRouteHandler(req, reply, cannyConfig);
  });

  app.post("/dev/trigger-crons", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.status(404).send({ error: "Not found" });
    }
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const jobs = await Promise.all([
      enqueueCronJob(request.server, JOB_NAMES.CRON_PUBLISH_SCHEDULED),
      enqueueCronJob(request.server, JOB_NAMES.CRON_REPOST),
      enqueueCronJob(request.server, JOB_NAMES.CRON_AUTOPLUG),
      enqueueCronJob(request.server, JOB_NAMES.CRON_BILLING_ZOMBIE_CLEANUP),
      request.server.queues.token.add(JOB_NAMES.TOKEN_HEALTH_SWEEP, {
        sweep: true,
      }),
    ]);
    return { triggered: jobs.map((j) => j.id) };
  });
}
