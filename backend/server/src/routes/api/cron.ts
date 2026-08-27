import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { accepted } from "../../middleware/auth.js";
import { enqueueCronJob, queueNameForJob } from "../../services/enqueue.js";
import { verifyCronSecretFromAuthorizationHeader } from "../../lib/cron-auth.js";
import {
  JOB_NAMES,
  SERVER_SIDE_PUBLISH_PLATFORMS,
  type JobName,
  type PublishPlatformJob,
} from "@social0/shared";
import { runPlatformJobOnServer } from "../../publish/process-platform-server.js";

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

function parsePublishPlatformJob(body: unknown): PublishPlatformJob | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (
    typeof o.postId !== "string" ||
    typeof o.userId !== "string" ||
    typeof o.publicationId !== "string" ||
    typeof o.connectedAccountId !== "string" ||
    typeof o.platform !== "string"
  ) {
    return null;
  }
  return {
    postId: o.postId,
    userId: o.userId,
    publicationId: o.publicationId,
    connectedAccountId: o.connectedAccountId,
    platform: o.platform as PublishPlatformJob["platform"],
    ...(typeof o.trackingId === "string" ? { trackingId: o.trackingId } : {}),
  };
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

  /**
   * Run one platform publish on the API server (used for Twitter from cron).
   * Auth: CRON_SECRET bearer. Returns 202 immediately; work continues in-process.
   */
  app.post("/cron/publish-platform", async (request, reply) => {
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const job = parsePublishPlatformJob(request.body);
    if (!job) {
      return reply.status(400).send({ error: "Invalid publish platform job" });
    }
    if (!SERVER_SIDE_PUBLISH_PLATFORMS.has(job.platform)) {
      return reply.status(400).send({
        error: `Platform ${job.platform} is not configured for server-side publish (X/TikTok stay on the API by default; set TWITTER_PUBLISH_ON_CF=1 or TIKTOK_PUBLISH_ON_CF=1 to send them to the worker)`,
      });
    }
    void runPlatformJobOnServer(request.server, job).catch((err) => {
      console.error("[cron/publish-platform] failed", job.platform, err);
    });
    return reply.status(202).send({ ok: true, platform: job.platform });
  });

  app.post("/cron/notify-legal-update", async (request, reply) => {
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const body = (request.body ?? {}) as { force?: boolean };
    const { notifyUsersOfLegalUpdate } = await import(
      "../../lib/legal-update-notify.js"
    );
    const result = await notifyUsersOfLegalUpdate({
      force: body.force === true,
    });
    return reply.status(200).send(result);
  });
}
