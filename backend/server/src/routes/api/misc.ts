import type { FastifyInstance } from "fastify";
import { runNextRouteHandler } from "../../lib/run-next-handler.js";
import { verifyCronSecretFromAuthorizationHeader } from "../../lib/cron-auth.js";
import { runPublishScheduledCron } from "../../cron/publish-scheduled.js";
import * as pinterestBoards from "../handlers/pinterest/boards.js";
import * as pinterestDefaultBoard from "../handlers/pinterest/default-board.js";
import * as changeEmailSendOtp from "../handlers/account/change-email-send-otp.js";
import * as changeEmail from "../handlers/account/change-email.js";
import * as cannySso from "../handlers/canny/sso.js";
import * as cannyConfig from "../handlers/canny/config.js";
import * as repostCron from "../handlers/cron/repost.js";
import * as autoplugCron from "../handlers/cron/autoplug.js";
import * as tokenHealthCron from "../handlers/cron/token-health.js";

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
  app.get("/canny/config", async (req, reply) => {
    await runNextRouteHandler(req, reply, cannyConfig.GET);
  });

  app.post("/dev/trigger-crons", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.status(404).send({ error: "Not found" });
    }
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const publishScheduled = await runPublishScheduledCron().catch((err) => ({
      error: err instanceof Error ? err.message : String(err),
    }));

    const cronRequest = new Request("http://localhost/api/cron", {
      headers: {
        Authorization: request.headers.authorization ?? "",
      },
    });

    const [repost, autoplug, tokenHealth] = await Promise.all([
      repostCron.GET(cronRequest),
      autoplugCron.GET(cronRequest),
      tokenHealthCron.GET(cronRequest),
    ]);

    return {
      publishScheduled,
      repost: await repost.json(),
      autoplug: await autoplug.json(),
      tokenHealth: await tokenHealth.json(),
    };
  });
}
