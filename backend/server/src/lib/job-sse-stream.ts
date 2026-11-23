import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { JobProgressEvent, JobProgressSnapshot } from "@social0/shared";
import { hasPublishJobTables } from "./publish-job-tracking.js";
import { resolveJobSnapshot } from "./resolve-job-snapshot.js";
import { loadJobChangeMarker } from "./job-snapshot-from-db.js";
import { useCloudflarePublishDispatch } from "../services/publish-dispatch.js";
import {
  enforceRateLimit,
  rpcLimiter,
  type RateLimitResult,
} from "./ratelimit.js";

type StreamOptions = {
  formatEvent?: (
    event: JobProgressEvent,
    snapshot: JobProgressSnapshot,
  ) => Record<string, unknown> | null;
  formatDone?: (snapshot: JobProgressSnapshot) => Record<string, unknown>;
  /** Frees the slot `admitJobStream` took; called once when the stream ends. */
  release?: () => void;
};

const POLL_INTERVAL_MS = 1_500;

/**
 * One DB poll tick: the full snapshot when the job changed since the last
 * tick, otherwise null without loading it. The snapshot is several queries
 * (job, events, publications); the change marker is one small one. A job
 * with no marker (or no tables) is always reloaded.
 */
export function createJobPollTick<S>(deps: {
  marker: () => Promise<string | null>;
  snapshot: () => Promise<S | null>;
}): () => Promise<S | null> {
  let lastMarker: string | null = null;
  return async () => {
    const marker = await deps.marker();
    if (marker !== null && marker === lastMarker) return null;
    lastMarker = marker;
    return deps.snapshot();
  };
}
const HEARTBEAT_INTERVAL_MS = 15_000;
/**
 * Hard ceiling on one stream.
 *
 * A job that never reaches a terminal state (worker died, queue lost the
 * message) otherwise leaves the connection open forever, and on the
 * Cloudflare path each open stream polls the database every 1.5s. A handful
 * of forgotten browser tabs turn into a permanent query load, so the stream
 * closes itself and lets the client reconnect or fall back to polling.
 */
const MAX_STREAM_MS = 15 * 60 * 1_000;

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

/**
 * Headers for the hijacked SSE response.
 *
 * `reply.hijack()` bypasses Fastify's send path, so anything hooks put on the
 * reply (CORS `Access-Control-Allow-Origin` / `-Credentials` from
 * `@fastify/cors`, `Vary`, …) is never flushed unless we copy it ourselves.
 * Without them the SPA's cross-origin `EventSource(…, { withCredentials })`
 * is blocked by the browser. The SSE framing headers always win, and a
 * stale `content-length` would truncate the stream, so it is dropped.
 */
export function sseResponseHeaders(reply: {
  getHeaders(): Record<string, string | number | string[] | undefined>;
}): Record<string, string | number | string[]> {
  const headers: Record<string, string | number | string[]> = {};
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value === undefined) continue;
    const key = name.toLowerCase();
    if (key === "content-length" || key in SSE_HEADERS) continue;
    headers[key] = value;
  }
  return { ...headers, ...SSE_HEADERS };
}

/**
 * Streams one user may hold open at once in this process (the API runs as a
 * single PM2 fork). The publish tray opens one per publish-now; anything past
 * this is a script, and on the Cloudflare path every stream polls Postgres
 * every 1.5s (or holds its own Redis subscriber on the BullMQ path). A refused
 * browser falls back to polling the publication list.
 */
export const MAX_JOB_STREAMS_PER_USER = 5;
const openStreamsByUser = new Map<string, number>();

/** Open streams `userId` holds in this process (tests + diagnostics). */
export function openJobStreamCount(userId: string): number {
  return openStreamsByUser.get(userId) ?? 0;
}

type AdmitRefusal = Extract<RateLimitResult, { allowed: false }>;

/**
 * Gate a job stream before the reply is hijacked: a per-minute open budget
 * (reconnect storms) plus the per-user concurrency cap. On success the caller
 * must hand `release` to `openJobSseStream` (it is idempotent), which frees
 * the slot whenever the stream ends.
 */
export async function admitJobStream(
  userId: string,
  rateKey: string,
): Promise<{ allowed: true; release: () => void } | AdmitRefusal> {
  const rate = await enforceRateLimit(rpcLimiter, rateKey);
  if (!rate.allowed) return rate;

  const open = openStreamsByUser.get(userId) ?? 0;
  if (open >= MAX_JOB_STREAMS_PER_USER) {
    return {
      allowed: false,
      status: 429,
      error: "Too many open job streams. Close one or poll the job instead.",
    };
  }
  openStreamsByUser.set(userId, open + 1);
  let released = false;
  return {
    allowed: true,
    release: () => {
      if (released) return;
      released = true;
      const left = (openStreamsByUser.get(userId) ?? 1) - 1;
      if (left > 0) openStreamsByUser.set(userId, left);
      else openStreamsByUser.delete(userId);
    },
  };
}

export async function openJobSseStream(
  request: FastifyRequest,
  reply: FastifyReply,
  app: FastifyInstance,
  trackingId: string,
  initialSnapshot: JobProgressSnapshot,
  options?: StreamOptions,
): Promise<void> {
  let subscriber: ReturnType<
    FastifyInstance["jobProgress"]["subscribe"]
  > | null = null;
  let closed = false;
  const stopTimers: Array<() => void> = [];

  /**
   * Idempotent, and must never reject: every caller is a `void cleanup()` from
   * a timer or an event handler, where a rejection becomes an unhandled one.
   * Every way out of the stream goes through here, so the concurrency slot is
   * always handed back.
   */
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    for (const stop of stopTimers) stop();
    if (subscriber) {
      try {
        await subscriber.unsubscribe();
        await subscriber.quit();
      } catch (err) {
        request.log.warn({ err, trackingId }, "job stream unsubscribe failed");
      }
    }
    try {
      if (!reply.raw.writableEnded) reply.raw.end();
    } catch (err) {
      request.log.warn({ err, trackingId }, "job stream close failed");
    }
    options?.release?.();
  };

  try {
    reply.hijack();
    reply.raw.writeHead(200, sseResponseHeaders(reply));
  } catch (err) {
    await cleanup();
    throw err;
  }
  // Registered before any await so a client that leaves early still frees
  // its slot instead of holding it until MAX_STREAM_MS.
  request.raw.on("close", () => {
    void cleanup();
  });

  let lastEventCount = 0;
  const writeEvent = (event: JobProgressEvent, snapshot: JobProgressSnapshot) => {
    const data = options?.formatEvent
      ? options.formatEvent(event, snapshot)
      : event;
    if (data === null) return;
    if (reply.raw.writableEnded) return;
    reply.raw.write(`event: progress\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const writeDone = (snapshot: JobProgressSnapshot) => {
    const data = options?.formatDone
      ? options.formatDone(snapshot)
      : { trackingId };
    if (reply.raw.writableEnded) return;
    reply.raw.write(`event: done\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const alreadyDone =
    initialSnapshot.status === "completed" ||
    initialSnapshot.status === "failed";

  // ponytail: late subscribers get the final snapshot only, not a history replay
  if (alreadyDone && options?.formatDone) {
    writeDone(initialSnapshot);
    await cleanup();
    return;
  }

  for (const event of initialSnapshot.events) {
    writeEvent(event, initialSnapshot);
  }
  lastEventCount = initialSnapshot.events.length;

  if (alreadyDone) {
    writeDone(initialSnapshot);
    await cleanup();
    return;
  }

  let useDbPoll: boolean;
  try {
    useDbPoll =
      useCloudflarePublishDispatch() && (await hasPublishJobTables());
  } catch (err) {
    request.log.warn({ err, trackingId }, "job stream setup failed");
    await cleanup();
    return;
  }
  // The client may have gone while we waited: start nothing.
  if (closed) return;

  if (!useDbPoll) {
    // The callback runs inside ioredis's "message" emitter, which does not await
    // it — an unhandled rejection here would take the process down, so a failed
    // snapshot read degrades to the one we already have.
    subscriber = app.jobProgress.subscribe(trackingId, (event) => {
      if (closed) return;
      void (async () => {
        try {
          const snapshot =
            (await resolveJobSnapshot(app, trackingId)) ?? initialSnapshot;
          if (closed) return;
          writeEvent(event, snapshot);
          if (event.phase === "completed" || event.phase === "failed") {
            writeDone(snapshot);
            await cleanup();
          }
        } catch (err) {
          request.log.warn({ err, trackingId }, "job stream event failed");
        }
      })();
    });
  }

  if (useDbPoll) {
    // Guard against overlap: `resolveJobSnapshot` runs three queries, and a slow
    // database would otherwise stack one poll on top of the next.
    let polling = false;
    // Rebuild the snapshot only when the job moved. Most of a stream's life is
    // an upload in progress, and every tick used to reload everything.
    const tick = createJobPollTick({
      marker: () => loadJobChangeMarker(trackingId),
      snapshot: () => resolveJobSnapshot(app, trackingId),
    });
    const poll = setInterval(async () => {
      if (closed || polling) return;
      polling = true;
      try {
        const snapshot = await tick();
        if (!snapshot || closed) return;
        const newEvents = snapshot.events.slice(lastEventCount);
        for (const event of newEvents) {
          writeEvent(event, snapshot);
        }
        lastEventCount = snapshot.events.length;
        if (snapshot.status === "completed" || snapshot.status === "failed") {
          writeDone(snapshot);
          void cleanup();
        }
      } catch (err) {
        request.log.warn({ err, trackingId }, "job stream poll failed");
      } finally {
        polling = false;
      }
    }, POLL_INTERVAL_MS);
    stopTimers.push(() => clearInterval(poll));
  }

  const heartbeat = setInterval(() => {
    if (closed || reply.raw.writableEnded) return;
    reply.raw.write(`: ping\n\n`);
  }, HEARTBEAT_INTERVAL_MS);
  stopTimers.push(() => clearInterval(heartbeat));

  const maxLifetime = setTimeout(() => {
    request.log.info({ trackingId }, "job stream hit max lifetime; closing");
    void cleanup();
  }, MAX_STREAM_MS);
  if (typeof maxLifetime.unref === "function") maxLifetime.unref();
  stopTimers.push(() => clearTimeout(maxLifetime));
}
