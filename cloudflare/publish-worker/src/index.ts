import {
  isKnownConsumerQueue,
  parseEnqueueRequest,
  verifyBearerAuth,
} from "./auth";
import { processPlatformJob } from "./process-platform";
import type { PublishPlatformJob } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "social0-publish",
        queues: {
          now: "social0-publish-now",
          scheduled: "social0-publish-scheduled",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!verifyBearerAuth(request, env.PUBLISH_HMAC_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (url.pathname === "/enqueue") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }

      const req = parseEnqueueRequest(body);
      if (!req) {
        return Response.json({ error: "Invalid publish job" }, { status: 400 });
      }

      const queueBinding =
        req.priority === "now"
          ? env.PUBLISH_NOW_QUEUE
          : env.PUBLISH_SCHEDULED_QUEUE;

      await queueBinding.send(req.job);

      return Response.json(
        {
          status: "queued",
          priority: req.priority,
          platform: req.job.platform,
        },
        { status: 202 },
      );
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    if (!isKnownConsumerQueue(batch.queue)) {
      console.error(`[publish-worker] unknown queue: ${batch.queue}`);
      for (const message of batch.messages) {
        message.retry();
      }
      return;
    }

    for (const message of batch.messages) {
      const job = message.body as PublishPlatformJob;
      try {
        await processPlatformJob(job, env);
        message.ack();
      } catch (err) {
        console.error("[publish-worker] platform job failed", err);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
