import {
  isKnownConsumerQueue,
  parseEnqueueRequest,
  verifyEnqueueAuth,
} from "./auth";
import { processPlatformJob } from "./process-platform";
import { assertPublishJobAuthorized } from "./validate-job";
import type { PublishPlatformJob } from "./types";

const MAX_BODY_BYTES = 8192;
const AUTH_FAIL_WINDOW_MS = 60_000;
const AUTH_FAIL_LIMIT = 30;
const authFailures = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function isAuthRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || entry.resetAt <= now) {
    authFailures.set(ip, { count: 1, resetAt: now + AUTH_FAIL_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > AUTH_FAIL_LIMIT;
}

function recordAuthFailure(ip: string): void {
  isAuthRateLimited(ip);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const ip = clientIp(request);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (isAuthRateLimited(ip)) {
      return new Response("Too many requests", { status: 429 });
    }

    const contentLength = Number(request.headers.get("Content-Length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }

    if (!(await verifyEnqueueAuth(request, env.PUBLISH_HMAC_SECRET, rawBody))) {
      recordAuthFailure(ip);
      return new Response("Unauthorized", { status: 401 });
    }

    if (url.pathname === "/enqueue") {
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }

      const req = parseEnqueueRequest(body);
      if (!req) {
        return Response.json({ error: "Invalid publish job" }, { status: 400 });
      }

      const authError = await assertPublishJobAuthorized(env, req.job);
      if (authError) {
        return Response.json({ error: authError }, { status: 403 });
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
        message.ack();
      }
      return;
    }

    for (const message of batch.messages) {
      const job = message.body as PublishPlatformJob;
      try {
        const authError = await assertPublishJobAuthorized(env, job);
        if (authError) {
          console.error("[publish-worker] unauthorized job dropped", authError);
          message.ack();
          continue;
        }
        await processPlatformJob(job, env);
        message.ack();
      } catch (err) {
        console.error("[publish-worker] platform job failed", err);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
