import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { accepted } from "../../middleware/auth.js";
import { enqueueCronJob, queueNameForJob } from "../../services/enqueue.js";
import { verifyCronSecretFromAuthorizationHeader } from "../../lib/cron-auth.js";
import { JOB_NAMES, type JobName } from "@social0/shared";

async function enqueueSchedulerCron(
  request: FastifyRequest,
  jobName: JobName,
  reply: FastifyReply,
) {
  const job = await enqueueCronJob(request.server, jobName);
  return reply
    .status(202)
    .send(accepted(job.id!, queueNameForJob(jobName)));
}

async function enqueueTokenHealthCron(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const job = await request.server.queues.token.add(
    JOB_NAMES.TOKEN_HEALTH_SWEEP,
    { sweep: true },
  );
  return reply
    .status(202)
    .send(accepted(job.id!, queueNameForJob(JOB_NAMES.TOKEN_HEALTH_SWEEP)));
}

function registerCronTrigger(
  app: FastifyInstance,
  path: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
) {
  app.post(path, handler);
}

export async function registerCronRoutes(app: FastifyInstance) {
  registerCronTrigger(app, "/cron/publish-scheduled", async (request, reply) => {
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return enqueueSchedulerCron(request, JOB_NAMES.CRON_PUBLISH_SCHEDULED, reply);
  });

  registerCronTrigger(app, "/cron/repost", async (request, reply) => {
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return enqueueSchedulerCron(request, JOB_NAMES.CRON_REPOST, reply);
  });

  registerCronTrigger(app, "/cron/autoplug", async (request, reply) => {
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return enqueueSchedulerCron(request, JOB_NAMES.CRON_AUTOPLUG, reply);
  });

  registerCronTrigger(app, "/cron/token-health", async (request, reply) => {
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return enqueueTokenHealthCron(request, reply);
  });

  registerCronTrigger(
    app,
    "/cron/billing-zombie-cleanup",
    async (request, reply) => {
      if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      return enqueueSchedulerCron(
        request,
        JOB_NAMES.CRON_BILLING_ZOMBIE_CLEANUP,
        reply,
      );
    },
  );
}
