import {
  parsePublishEnvelope,
  queueKindForBatch,
  verifyBearerAuth,
} from "./auth";
import { fanOutPost, runPlatformPublish } from "./publish";
import type { PublishJobEnvelope } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "social0-publish",
        queues: {
          orchestrator: "social0-publish-orchestrator",
          platform: "social0-publish-platform",
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

      const envelope = parsePublishEnvelope(body);
      if (!envelope) {
        return Response.json({ error: "Invalid publish envelope" }, { status: 400 });
      }

      if (envelope.kind === "orchestrator") {
        await env.PUBLISH_ORCHESTRATOR_QUEUE.send(envelope);
      } else {
        await env.PUBLISH_PLATFORM_QUEUE.send(envelope);
      }

      return Response.json({ status: "queued", kind: envelope.kind }, { status: 202 });
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const expectedKind = queueKindForBatch(batch.queue);
    if (!expectedKind) {
      console.error(`[publish-worker] unknown queue: ${batch.queue}`);
      for (const message of batch.messages) {
        message.retry();
      }
      return;
    }

    for (const message of batch.messages) {
      const body = message.body as PublishJobEnvelope;

      if (body.kind !== expectedKind) {
        console.error(
          `[publish-worker] envelope kind ${body.kind} does not match queue ${batch.queue}`,
        );
        message.retry();
        continue;
      }

      try {
        if (expectedKind === "orchestrator") {
          if (body.kind !== "orchestrator") continue;
          await fanOutPost(body.job, env);
        } else {
          if (body.kind !== "platform") continue;
          const result = await runPlatformPublish(body.job, env);
          if (!result.ok) {
            throw new Error(result.error ?? "platform publish failed");
          }
        }
        message.ack();
      } catch (err) {
        console.error("[publish-worker] job failed", err);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
