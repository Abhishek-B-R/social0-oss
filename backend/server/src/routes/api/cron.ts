import type { FastifyInstance } from "fastify";
import { verifyCronSecretFromAuthorizationHeader } from "../../lib/cron-auth.js";
import { runPublishScheduledCron } from "../../cron/publish-scheduled.js";
import { runNextRouteHandler } from "../../lib/run-next-handler.js";
import * as repostCron from "../handlers/cron/repost.js";
import * as autoplugCron from "../handlers/cron/autoplug.js";
import * as tokenHealthCron from "../handlers/cron/token-health.js";

function verifyCronSecret(request: {
  headers: { authorization?: string | string[] };
}) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  return verifyCronSecretFromAuthorizationHeader(request.headers.authorization);
}

export async function registerCronRoutes(app: FastifyInstance) {
  app.post("/cron/publish-scheduled", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const result = await runPublishScheduledCron();
    return reply.send({ ok: true, ...result });
  });

  app.post("/cron/repost", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    await runNextRouteHandler(request, reply, repostCron.GET);
  });

  app.post("/cron/autoplug", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    await runNextRouteHandler(request, reply, autoplugCron.GET);
  });

  app.post("/cron/token-health", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    await runNextRouteHandler(request, reply, tokenHealthCron.GET);
  });

  app.get("/cron/billing-zombie-cleanup", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const forceParam = (request.query as { force?: string }).force;
    const force = forceParam === "1" || forceParam === "true";
    const { sweepStaleZombieSubscriptions } = await import(
      "../../lib/billing-zombie-cleanup.js"
    );
    const result = await sweepStaleZombieSubscriptions({ force });
    return reply.send(result);
  });

  app.post("/cron/billing-zombie-cleanup", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const forceParam = (request.query as { force?: string }).force;
    const force = forceParam === "1" || forceParam === "true";
    const { sweepStaleZombieSubscriptions } = await import(
      "../../lib/billing-zombie-cleanup.js"
    );
    const result = await sweepStaleZombieSubscriptions({ force });
    return reply.send(result);
  });
}
