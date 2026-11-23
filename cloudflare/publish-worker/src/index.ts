import {
  CF_PUBLISH_QUEUES,
  isKnownConsumerQueue,
  parseEnqueueRequest,
  verifyEnqueueAuth,
} from "./auth";
import { recordPlatformResult } from "./job-progress-db";
import { processPlatformJob, PublishRetryLaterError } from "./process-platform";
import { PublishSlotBusyError } from "./publish-concurrency";
import { assertPublishJobAuthorized } from "./validate-job";
import { openSql } from "./db";
import type { PublishPlatformJob } from "./types";

const MAX_BODY_BYTES = 8192;
const AUTH_FAIL_WINDOW_MS = 60_000;
const AUTH_FAIL_LIMIT = 30;
/** Keep the per-isolate table from growing without bound on a spray of IPs. */
const AUTH_FAIL_MAX_TRACKED_IPS = 10_000;
const authFailures = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function evictExpiredAuthFailures(now: number): void {
  for (const [ip, entry] of authFailures) {
    if (entry.resetAt <= now) authFailures.delete(ip);
  }
}

/**
 * Read-only check. This must NOT count the request: the API droplet enqueues
 * every publish from one source IP, so counting successful calls here would
 * throttle real publishes at 30/min. Only `recordAuthFailure` increments.
 */
function isAuthRateLimited(ip: string): boolean {
  const entry = authFailures.get(ip);
  if (!entry || entry.resetAt <= Date.now()) return false;
  return entry.count > AUTH_FAIL_LIMIT;
}

function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || entry.resetAt <= now) {
    if (authFailures.size >= AUTH_FAIL_MAX_TRACKED_IPS) {
      evictExpiredAuthFailures(now);
      if (authFailures.size >= AUTH_FAIL_MAX_TRACKED_IPS) return;
    }
    authFailures.set(ip, { count: 1, resetAt: now + AUTH_FAIL_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/**
 * Send a job that found the publish caps full back to its queue with a delay.
 *
 * A fresh message rather than `message.retry()`: retries are for crashes and
 * count toward `max_retries`, so waiting for capacity would dead-letter a job
 * that never failed. If the send itself fails, fall back to a retry so the
 * job is not lost.
 */
async function requeueForSlot(
  queueName: string,
  env: Env,
  message: Message,
  job: PublishPlatformJob,
  delaySeconds: number,
): Promise<void> {
  const queue =
    queueName === CF_PUBLISH_QUEUES.NOW ? env.PUBLISH_NOW_QUEUE : env.PUBLISH_SCHEDULED_QUEUE;
  try {
    await queue.send({ ...job, slotWaits: (job.slotWaits ?? 0) + 1 }, { delaySeconds });
    message.ack();
  } catch (sendErr) {
    console.error("[publish-worker] requeue for capacity failed, retrying message", sendErr);
    message.retry({ delaySeconds });
  }
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
      // One client for the whole message: the ownership check, progress
      // events and the final result each used to open their own.
      const sql = await openSql(env);
      try {
        const authError = await assertPublishJobAuthorized(env, job, sql);
        if (authError) {
          console.error("[publish-worker] unauthorized job dropped", authError);
          await recordPlatformResult(
            env,
            job,
            false,
            `Publish worker rejected job: ${authError}`,
            { skipAuth: true, sql },
          );
          message.ack();
          continue;
        }
        await processPlatformJob(job, env, message.attempts, sql);
        message.ack();
      } catch (err) {
        if (err instanceof PublishSlotBusyError) {
          await requeueForSlot(batch.queue, env, message, job, err.delaySeconds);
          continue;
        }
        if (err instanceof PublishRetryLaterError) {
          console.warn(
            `[publish-worker] ${job.platform} retry ${message.attempts} in ${err.delaySeconds}s: ${err.reason}`,
          );
          message.retry({ delaySeconds: err.delaySeconds });
          continue;
        }
        const messageText =
          err instanceof Error ? err.message : "Platform worker failed";
        console.error("[publish-worker] platform job failed", err);
        await recordPlatformResult(env, job, false, messageText, {
          skipAuth: true,
          sql,
        });
        message.ack();
      } finally {
        await sql.end({ timeout: 0 }).catch(() => undefined);
      }
    }
  },
} satisfies ExportedHandler<Env>;
