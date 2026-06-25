import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { type JobProgressEvent } from "@social0/shared";
import {
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";
import {
  createPublishTrackingId,
  enqueuePublishPost,
  queueNameForJob,
  useCloudflarePublishDispatch,
} from "../../services/enqueue.js";
import { loadJobSnapshotFromDb } from "../../lib/job-snapshot-from-db.js";
import { hasPublishJobTables } from "../../lib/publish-job-tracking.js";

const publishSchema = z
  .object({
    postId: z.string(),
    connectedAccountIds: z.array(z.string()).optional(),
    /** ISO datetime — schedule for later (BullMQ delay, no SSE). */
    scheduledAt: z.string().datetime().optional(),
    /** Explicit mode override. */
    mode: z.enum(["now", "schedule"]).optional(),
  })
  .refine(
    (d) => !(d.mode === "schedule" && !d.scheduledAt),
    { message: "scheduledAt required when mode is schedule", path: ["scheduledAt"] },
  );

function isScheduleRequest(data: z.infer<typeof publishSchema>) {
  if (data.mode === "schedule") return true;
  if (data.mode === "now") return false;
  return Boolean(data.scheduledAt && new Date(data.scheduledAt).getTime() > Date.now());
}

export async function registerPublishRoutes(app: FastifyInstance) {
  app.post("/publish", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const body = publishSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const schedule = isScheduleRequest(body.data);

    if (schedule) {
      const scheduledAt = body.data.scheduledAt!;
      const delay = Math.max(0, new Date(scheduledAt).getTime() - Date.now());

      const dispatched = await enqueuePublishPost(
        app,
        {
          postId: body.data.postId,
          userId,
          connectedAccountIds: body.data.connectedAccountIds,
        },
        { delay },
      );

      return reply.status(200).send({
        status: "scheduled",
        postId: body.data.postId,
        scheduledAt,
        jobId: dispatched.id,
        backend: dispatched.backend,
        message: "Post scheduled successfully",
      });
    }

    const trackingId = createPublishTrackingId();
    await app.jobProgress.initJob({
      trackingId,
      postId: body.data.postId,
      userId,
    });

    const dispatched = await enqueuePublishPost(
      app,
      {
        postId: body.data.postId,
        userId,
        trackingId,
        connectedAccountIds: body.data.connectedAccountIds,
      },
      { trackingId },
    );

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

export async function registerJobRoutes(app: FastifyInstance) {
  app.get("/jobs/:trackingId", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const { trackingId } = request.params as { trackingId: string };
    let snapshot = await app.jobProgress.getSnapshot(trackingId);
    if (!snapshot) {
      snapshot = await loadJobSnapshotFromDb(trackingId);
    }
    if (!snapshot) {
      return reply.status(404).send({ error: "Job not found", trackingId });
    }
    if (snapshot.userId !== userId) {
      return reply.status(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }
    return snapshot;
  });

  app.get("/jobs/:trackingId/stream", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const { trackingId } = request.params as { trackingId: string };
    let snapshot = await app.jobProgress.getSnapshot(trackingId);
    if (!snapshot) {
      snapshot = await loadJobSnapshotFromDb(trackingId);
    }
    if (!snapshot) {
      return reply.status(404).send({ error: "Job not found", trackingId });
    }
    if (snapshot.userId !== userId) {
      return reply.status(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    await openSseStream(request, reply, app, trackingId, snapshot);
  });
}

async function openSseStream(
  request: FastifyRequest,
  reply: FastifyReply,
  app: FastifyInstance,
  trackingId: string,
  initialSnapshot: { events: JobProgressEvent[]; status: string },
) {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let lastEventCount = 0;
  const writeEvent = (event: JobProgressEvent) => {
    reply.raw.write(`event: progress\n`);
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  for (const event of initialSnapshot.events) {
    writeEvent(event);
  }
  lastEventCount = initialSnapshot.events.length;

  if (
    initialSnapshot.status === "completed" ||
    initialSnapshot.status === "failed"
  ) {
    reply.raw.write(`event: done\ndata: ${JSON.stringify({ trackingId })}\n\n`);
    reply.raw.end();
    return;
  }

  const useDbPoll =
    useCloudflarePublishDispatch() && (await hasPublishJobTables());
  let subscriber: ReturnType<FastifyInstance["jobProgress"]["subscribe"]> | null =
    null;

  if (!useDbPoll) {
    subscriber = app.jobProgress.subscribe(trackingId, (event) => {
      writeEvent(event);
      if (event.phase === "completed" || event.phase === "failed") {
        reply.raw.write(`event: done\ndata: ${JSON.stringify({ trackingId })}\n\n`);
        void cleanup();
      }
    });
  }

  const pollDb = useDbPoll
    ? setInterval(async () => {
        const snapshot = await loadJobSnapshotFromDb(trackingId);
        if (!snapshot) return;
        const newEvents = snapshot.events.slice(lastEventCount);
        for (const event of newEvents) {
          writeEvent(event);
        }
        lastEventCount = snapshot.events.length;
        if (snapshot.status === "completed" || snapshot.status === "failed") {
          reply.raw.write(
            `event: done\ndata: ${JSON.stringify({ trackingId })}\n\n`,
          );
          void cleanup();
        }
      }, 1500)
    : null;

  const heartbeat = setInterval(() => {
    reply.raw.write(`: ping\n\n`);
  }, 15_000);

  const cleanup = async () => {
    clearInterval(heartbeat);
    if (pollDb) clearInterval(pollDb);
    if (subscriber) {
      await subscriber.unsubscribe();
      await subscriber.quit();
    }
    if (!reply.raw.writableEnded) reply.raw.end();
  };

  request.raw.on("close", () => {
    void cleanup();
  });
}
