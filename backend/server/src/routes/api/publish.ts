import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { resolveRequestActor, unauthorized } from "../../middleware/auth.js";
import {
  enforceRateLimit,
  publishLimiter,
  rpcLimiter,
} from "../../lib/ratelimit.js";
import { scheduledAtInputSchema, scheduleTimezoneSchema } from "../../lib/validation.js";
import { resolveScheduledAt } from "../../lib/resolve-scheduled-at.js";
import {
  createPublishTrackingId,
  enqueuePublishPost,
  queueNameForJob,
  useCloudflarePublishDispatch,
} from "../../services/enqueue.js";
import { admitJobStream, openJobSseStream } from "../../lib/job-sse-stream.js";
import { resolveJobSnapshot } from "../../lib/resolve-job-snapshot.js";
import { requireWorkspacePermissionForActor } from "../../lib/workspace/session.js";
import { postScopeCondition } from "../../lib/workspace/context.js";
import { db } from "../../db/index.js";
import { posts } from "../../db/schema.js";
import { emitPostScheduledWebhook } from "../../lib/post-lifecycle-webhooks.js";
import {
  releaseFreePost,
  type FreePostReservation,
} from "../../lib/plan-limits.js";
import {
  reserveFreePostQuota,
  validateScheduledAtWindow,
} from "../../services/posts.js";
import { PostClaimLostError } from "../../services/publish-enqueue.js";

const publishSchema = z
  .object({
    postId: z.string(),
    /**
     * Refused, not supported. Publishing to part of a post's accounts claimed
     * the whole post but left the other accounts' rows `pending`, so the post
     * never finalized, and its Retry (or the stale sweeper's failure email)
     * then went to the very accounts the caller left out. Kept in the schema
     * only so a caller still sending it gets a 400 instead of having it
     * silently dropped, which would publish to every account on the post.
     */
    connectedAccountIds: z
      .array(z.string())
      .max(0, {
        message:
          "Publishing to only some of a post's accounts is not supported. Remove the other accounts from the post, then publish it.",
      })
      .optional(),
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

type PublishBody = z.infer<typeof publishSchema>;

/**
 * Decide schedule vs now from the *resolved* time, never from `new Date()` on
 * the raw string. `scheduledAt` may be `…+default` (NaN to `Date`) or a naive
 * wall time in `timezone` (read by `Date` in the server's zone), and either
 * one misread as "not in the future" published the post on every platform at
 * once instead of scheduling it.
 *
 * Returns the instant to schedule at, or `null` to publish now: `mode: "now"`,
 * no `scheduledAt`, or (with no mode) a time that has already passed.
 */
async function resolveScheduleRequest(
  userId: string,
  data: PublishBody,
): Promise<{ ok: true; at: Date | null } | { ok: false; error: string }> {
  if (data.mode === "now" || !data.scheduledAt) return { ok: true, at: null };

  const resolved = await resolveScheduledAt(
    userId,
    data.scheduledAt,
    data.timezone,
  );
  if (!resolved.ok) return resolved;

  if (data.mode !== "schedule" && resolved.utc.getTime() <= Date.now()) {
    return { ok: true, at: null };
  }

  // Same window as every other way to schedule (composer, edit, reschedule).
  const windowError = validateScheduledAtWindow(resolved.utc);
  if (windowError) return { ok: false, error: windowError };
  return { ok: true, at: resolved.utc };
}

const POST_CHANGED_ERROR =
  "This post is already publishing or was changed by another request. Refresh and try again.";

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
    const { postId } = body.data;

    const [owned] = await db
      .select({ id: posts.id, status: posts.status })
      .from(posts)
      .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)))
      .limit(1);
    if (!owned) {
      return reply
        .status(404)
        .send({ error: "Post not found or not publishable" });
    }

    const schedule = await resolveScheduleRequest(userId, body.data);
    if (!schedule.ok) {
      return reply.status(400).send({ error: schedule.error });
    }

    if (schedule.at) {
      const at = schedule.at;

      // Same rule as `v1SchedulePost`: only work that has not gone out yet can
      // be given a time. Without it this route could drag a published post back
      // to `scheduled` and have the cron publish it a second time.
      if (owned.status !== "draft" && owned.status !== "scheduled") {
        return reply.status(400).send({
          error: "Only draft or scheduled posts can be scheduled",
        });
      }

      // Scheduling a draft is a submission and costs one free post, as it does
      // from the composer and `/v1`. Rescheduling a scheduled post is free: it
      // was charged when it was first scheduled.
      let reservation: FreePostReservation | null = null;
      if (owned.status === "draft") {
        const quota = await reserveFreePostQuota(userId, postId);
        if (!quota.ok) {
          return reply
            .status(403)
            .send({ error: quota.error, code: "FREE_POST_LIMIT" });
        }
        reservation = quota.reservation;
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
      //
      // Conditional on the status read above: a racing request already moved
      // (and charged for) a draft, and a scheduled post the cron has just
      // claimed must not be put back in line to publish a second time.
      let claimed: { id: string }[];
      try {
        claimed = await db
          .update(posts)
          .set({ status: "scheduled", scheduledAt: at, updatedAt: new Date() })
          .where(
            and(
              eq(posts.id, postId),
              postScopeCondition(ws.ctx),
              eq(posts.status, owned.status),
            ),
          )
          .returning({ id: posts.id });
      } catch (err) {
        if (reservation) await releaseFreePost(reservation, userId);
        throw err;
      }
      if (claimed.length === 0) {
        if (reservation) await releaseFreePost(reservation, userId);
        return reply.status(409).send({ error: POST_CHANGED_ERROR });
      }

      emitPostScheduledWebhook(userId, postId, at);

      return reply.status(200).send({
        status: "scheduled",
        postId,
        scheduledAt: at.toISOString(),
        backend: useCloudflarePublishDispatch() ? "cloudflare" : "server",
        message: "Post scheduled successfully",
      });
    }

    // Publishing a draft is a "Publish now" submission and costs one free
    // post, as it does over RPC and `/v1`. Anything else (a scheduled post
    // published early, a retry of a failed one) was charged already.
    const isDraft = owned.status === "draft";
    let reservation: FreePostReservation | null = null;
    if (isDraft) {
      const quota = await reserveFreePostQuota(userId, postId);
      if (!quota.ok) {
        return reply
          .status(403)
          .send({ error: quota.error, code: "FREE_POST_LIMIT" });
      }
      reservation = quota.reservation;
    }

    /**
     * Hand the free post back when this request published nothing: the draft
     * claim was lost to another request, or nothing was dispatched and the
     * post is (still, or again) a draft. A partial fan-out stays `publishing`
     * and keeps the charge.
     */
    const refundIfNothingWentOut = async (claimLost: boolean) => {
      if (!reservation) return;
      if (!claimLost) {
        const [after] = await db
          .select({ status: posts.status })
          .from(posts)
          .where(eq(posts.id, postId))
          .limit(1);
        if (after?.status !== "draft") return;
      }
      await releaseFreePost(reservation, userId);
    };

    const trackingId = createPublishTrackingId();

    let dispatched;
    try {
      dispatched = await enqueuePublishPost(
        app,
        { postId, userId, trackingId },
        // The claim is what makes the charge hold: two racing requests both
        // reserve, only one moves the draft, and the other refunds below
        // instead of publishing the post a second time.
        { trackingId, onlyFromStatus: isDraft ? "draft" : undefined },
      );
    } catch (err) {
      const claimLost = err instanceof PostClaimLostError;
      await refundIfNothingWentOut(claimLost);
      if (claimLost) {
        return reply.status(409).send({ error: POST_CHANGED_ERROR });
      }
      const message =
        err instanceof Error ? err.message : "Failed to enqueue publish";
      if (message.includes("No publication targets")) {
        return reply.status(404).send({ error: "Post not found or not publishable" });
      }
      throw err;
    }

    if (dispatched.enqueued === 0) {
      await refundIfNothingWentOut(false);
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

    // The SPA follows jobs over the stream and the publication list, so this
    // is a CLI-style poll: budget it like any other per-user read.
    const rate = await enforceRateLimit(rpcLimiter, `jobs:${actor.userId}`);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

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

    // Every open stream polls Postgres (or holds a Redis subscriber) for up to
    // 15 minutes, so opens are budgeted and capped per viewer.
    const admit = await admitJobStream(actor.userId, `jobstream:${actor.userId}`);
    if (!admit.allowed) {
      return reply.status(admit.status).send({ error: admit.error });
    }
    await openJobSseStream(request, reply, app, trackingId, snapshot, {
      release: admit.release,
    });
  });
}
