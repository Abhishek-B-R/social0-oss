import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { resolveRequestActor, unauthorized } from "../../middleware/auth.js";
import { enforceRateLimit, publishLimiter } from "../../lib/ratelimit.js";
import { scheduledAtInputSchema, scheduleTimezoneSchema } from "../../lib/validation.js";
import { resolveScheduledAt } from "../../lib/resolve-scheduled-at.js";
import {
  createPublishTrackingId,
  enqueuePublishPost,
  queueNameForJob,
  useCloudflarePublishDispatch,
} from "../../services/enqueue.js";
import { openJobSseStream } from "../../lib/job-sse-stream.js";
import { resolveJobSnapshot } from "../../lib/resolve-job-snapshot.js";
import { requireWorkspacePermissionForActor } from "../../lib/workspace/session.js";
import { postScopeCondition } from "../../lib/workspace/context.js";
import { db } from "../../db/index.js";
import { posts } from "../../db/schema.js";

const publishSchema = z
  .object({
    postId: z.string(),
    connectedAccountIds: z.array(z.string()).optional(),
    /** ISO datetime - UTC, offset, +default, or naive with timezone */
    scheduledAt: scheduledAtInputSchema.optional(),
    timezone: scheduleTimezoneSchema,
    /** Explicit mode override. */
    mode: z.enum(["now", "schedule"]).optional(),
  })
  .refine((d) => !(d.mode === "schedule" && !d.scheduledAt), {
    message: "scheduledAt required when mode is schedule",
    path: ["scheduledAt"],
  });

function isScheduleRequest(data: z.infer<typeof publishSchema>) {
  if (data.mode === "schedule") return true;
  if (data.mode === "now") return false;
  return Boolean(
    data.scheduledAt && new Date(data.scheduledAt).getTime() > Date.now(),
  );
}

export async function registerPublishRoutes(app: FastifyInstance) {
  app.post("/publish", async (request, reply) => {
    const actor = await resolveRequestActor(request);
    if (!actor) return reply.status(401).send(unauthorized());
    const actorUserId = actor.userId;

    const ws = await requireWorkspacePermissionForActor(
      actor,
      "publish_posts",
    );
    if (!ws.ok) {
      return reply.status(ws.statusCode).send({ error: ws.error });
    }
    const userId = ws.ctx.resourceUserId;

    const rate = await enforceRateLimit(publishLimiter, actorUserId);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const body = publishSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const [owned] = await db
      .select({ id: posts.id, status: posts.status })
      .from(posts)
      .where(
        and(eq(posts.id, body.data.postId), postScopeCondition(ws.ctx)),
      )
      .limit(1);
    if (!owned) {
      return reply
        .status(404)
        .send({ error: "Post not found or not publishable" });
    }

    const schedule = isScheduleRequest(body.data);

    if (schedule) {
      const resolved = await resolveScheduledAt(
        userId,
        body.data.scheduledAt!,
        body.data.timezone,
      );
      if (!resolved.ok) {
        return reply.status(400).send({ error: resolved.error });
      }
      const scheduledAt = resolved.utc.toISOString();

      // Same rule as `v1SchedulePost`: only work that has not gone out yet can
      // be given a time. Without it this route could drag a published post back
      // to `scheduled` and have the cron publish it a second time.
      if (owned.status !== "draft" && owned.status !== "scheduled") {
        return reply.status(400).send({
          error: "Only draft or scheduled posts can be scheduled",
        });
      }

      // Scheduling is a DB write, not an enqueue: `publish-scheduled` scans
      // `posts.scheduled_at` every 5 minutes and dispatches from there.
      //
      // This used to hand the delay to `enqueuePublishPost`, which throws on
      // the Cloudflare backend by contract ("Delayed publish on Cloudflare uses
      // scheduled posts + cron; do not pass delay") — so every scheduled
      // request through this route 500'd in production, and on the BullMQ
      // backend it flipped the post to `publishing` immediately and left the
      // cron with nothing to find.
      await db
        .update(posts)
        .set({
          status: "scheduled",
          scheduledAt: resolved.utc,
          updatedAt: new Date(),
        })
        .where(and(eq(posts.id, body.data.postId), postScopeCondition(ws.ctx)));

      return reply.status(200).send({
        status: "scheduled",
        postId: body.data.postId,
        scheduledAt,
        backend: useCloudflarePublishDispatch() ? "cloudflare" : "bullmq",
        message: "Post scheduled successfully",
      });
    }

    const trackingId = createPublishTrackingId();

    let dispatched;
    try {
      dispatched = await enqueuePublishPost(
        app,
        {
          postId: body.data.postId,
          userId,
          trackingId,
          connectedAccountIds: body.data.connectedAccountIds,
        },
        { trackingId },
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to enqueue publish";
      if (message.includes("No publication targets")) {
        return reply.status(404).send({ error: "Post not found or not publishable" });
      }
      throw err;
    }

    if (dispatched.enqueued === 0) {
      return reply.status(404).send({ error: "Post not found or not publishable" });
    }

    return reply.status(202).send({
      trackingId,
      jobId: dispatched.id,
      status: "queued",
      backend: dispatched.backend,
      enqueued: dispatched.enqueued,
      queue: queueNameForJob("now"),
      streamUrl: `/api/jobs/${trackingId}/stream`,
    });
  });
}

/**
 * Publish jobs are owned by the workspace *resource* user (the team owner), not
 * by whoever pressed publish. A teammate watching their own job must therefore
 * be matched through the workspace context, or every team publish 403s on its
 * own progress stream.
 */
async function canReadJob(
  actor: { userId: string; source: "session" | "apiKey" | "devHeader" },
  jobUserId: string,
): Promise<boolean> {
  if (jobUserId === actor.userId) return true;
  const ws = await requireWorkspacePermissionForActor(actor, "view_posts");
  return ws.ok && ws.ctx.resourceUserId === jobUserId;
}

export async function registerJobRoutes(app: FastifyInstance) {
  app.get("/jobs/:trackingId", async (request, reply) => {
    const actor = await resolveRequestActor(request);
    if (!actor) return reply.status(401).send(unauthorized());

    const { trackingId } = request.params as { trackingId: string };
    const snapshot = await resolveJobSnapshot(app, trackingId);
    if (!snapshot) {
      return reply.status(404).send({ error: "Job not found", trackingId });
    }
    if (!(await canReadJob(actor, snapshot.userId))) {
      return reply.status(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }
    return snapshot;
  });

  app.get("/jobs/:trackingId/stream", async (request, reply) => {
    const actor = await resolveRequestActor(request);
    if (!actor) return reply.status(401).send(unauthorized());

    const { trackingId } = request.params as { trackingId: string };
    const snapshot = await resolveJobSnapshot(app, trackingId);
    if (!snapshot) {
      return reply.status(404).send({ error: "Job not found", trackingId });
    }
    if (!(await canReadJob(actor, snapshot.userId))) {
      return reply.status(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    await openJobSseStream(request, reply, app, trackingId, snapshot);
  });
}
