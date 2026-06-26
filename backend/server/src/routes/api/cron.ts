import type { FastifyInstance } from "fastify";
import { accepted } from "../../middleware/auth.js";
import { enqueueCronJob, queueNameForJob } from "../../services/enqueue.js";
import { verifyCronSecretFromAuthorizationHeader } from "../../lib/cron-auth.js";
import { JOB_NAMES } from "@social0/shared";

function verifyCronSecret(request: { headers: { authorization?: string | string[] } }) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return false;
  }
  return verifyCronSecretFromAuthorizationHeader(request.headers.authorization);
}

export async function registerCronRoutes(app: FastifyInstance) {
  app.post("/cron/publish-scheduled", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const job = await enqueueCronJob(app, JOB_NAMES.CRON_PUBLISH_SCHEDULED);
    return reply
      .status(202)
      .send(accepted(job.id!, queueNameForJob(JOB_NAMES.CRON_PUBLISH_SCHEDULED)));
  });

  app.post("/cron/repost", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const job = await enqueueCronJob(app, JOB_NAMES.CRON_REPOST);
    return reply
      .status(202)
      .send(accepted(job.id!, queueNameForJob(JOB_NAMES.CRON_REPOST)));
  });

  app.post("/cron/autoplug", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const job = await enqueueCronJob(app, JOB_NAMES.CRON_AUTOPLUG);
    return reply
      .status(202)
      .send(accepted(job.id!, queueNameForJob(JOB_NAMES.CRON_AUTOPLUG)));
  });

  app.post("/cron/token-health", async (request, reply) => {
    if (!verifyCronSecret(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const job = await app.queues.token.add(JOB_NAMES.TOKEN_HEALTH_SWEEP, {
      sweep: true,
    });
    return reply
      .status(202)
      .send(accepted(job.id!, queueNameForJob(JOB_NAMES.TOKEN_HEALTH_SWEEP)));
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
