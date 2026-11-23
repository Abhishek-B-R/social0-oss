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
import { startPlatformJobOnServer } from "../../publish/server-platform-jobs.js";
import { maybeFinalizePostPublish } from "../../publish/finalize-post.js";
import { isValidUUID } from "../../lib/validation.js";
import { reconcileAgencyExtraAccounts } from "../../lib/extra-accounts.js";

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
   * Auth: CRON_SECRET bearer. Returns 202 immediately; work continues in-process
   * and a graceful shutdown (`index.ts`) waits for it.
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
        error: `Platform ${job.platform} is not configured for server-side publish (X, TikTok and Bluesky stay on the API by default; TWITTER_PUBLISH_ON_CF=1, TIKTOK_PUBLISH_ON_CF=1 or BLUESKY_PUBLISH_ON_CF=1 sends one to the worker)`,
      });
    }
    // Tracked, so a shutdown waits for it instead of killing it mid-upload.
    startPlatformJobOnServer(request.server, job, "[cron/publish-platform] failed");
    return reply.status(202).send({ ok: true, platform: job.platform });
  });

  /**
   * Finalize one post (aggregate status, queue slot, failure email, webhooks).
   * The background worker calls this after a scheduled fan-out that failed part
   * way: the jobs that did go out may already have finished and finalized
   * while the rest were still `pending`, so nothing else would finalize it.
   * Idempotent: finalize waits for rows still in flight and claims its email
   * and webhook once per post. Awaited, so the worker knows it ran.
   */
  app.post("/cron/finalize-post", async (request, reply) => {
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (
      typeof body.postId !== "string" ||
      !isValidUUID(body.postId) ||
      typeof body.userId !== "string" ||
      !body.userId
    ) {
      return reply.status(400).send({ error: "postId and userId are required" });
    }
    await maybeFinalizePostPublish(body.postId, body.userId);
    return reply.status(200).send({ ok: true });
  });

  /**
   * Email every user about a Terms/Privacy bump. The send loop runs in the
   * background (minutes for thousands of users), so this answers 202 once the
   * single-run claim is held. A retry while it runs gets 409; a re-run after a
   * crash or failed sends resumes and mails only users not yet mailed.
   */
  /**
   * Agency extra accounts: re-sync every Agency subscription whose add-on
   * quantity does not match its connected accounts (a sync that failed at
   * connect / disconnect time, or a missed webhook). Runs in-process and
   * answers 202 at once.
   */
  app.post("/cron/agency-extra-accounts", async (request, reply) => {
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    void reconcileAgencyExtraAccounts()
      .then((r) => console.log("[cron/agency-extra-accounts] done", r))
      .catch((e: unknown) =>
        console.error("[cron/agency-extra-accounts] failed", String(e)),
      );
    return reply.status(202).send({ accepted: true });
  });

  app.post("/cron/notify-legal-update", async (request, reply) => {
    if (!verifyCronSecretFromAuthorizationHeader(request.headers.authorization)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const body = (request.body ?? {}) as { force?: boolean };
    const { claimLegalUpdateNotify, runLegalUpdateNotify } = await import(
      "../../lib/legal-update-notify.js"
    );
    const claim = await claimLegalUpdateNotify({ force: body.force === true });
    switch (claim.status) {
      case "unavailable":
        return reply.status(503).send({ error: claim.reason });
      case "skipped":
        return reply.status(200).send({ skipped: true, reason: claim.reason });
      case "running":
        return reply.status(409).send({ skipped: true, reason: claim.reason });
      case "claimed":
        void runLegalUpdateNotify(claim.lockToken).catch((err) => {
          console.error("[cron/notify-legal-update] failed", err);
        });
        return reply
          .status(202)
          .send({ accepted: true, alreadySent: claim.alreadySent });
    }
  });
}
