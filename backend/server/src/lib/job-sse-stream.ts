import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { JobProgressEvent, JobProgressSnapshot } from "@social0/shared";
import { hasPublishJobTables } from "./publish-job-tracking.js";
import { resolveJobSnapshot } from "./resolve-job-snapshot.js";
import { useCloudflarePublishDispatch } from "../services/publish-dispatch.js";

type StreamFormatters = {
  formatEvent?: (
    event: JobProgressEvent,
    snapshot: JobProgressSnapshot,
  ) => Record<string, unknown> | null;
  formatDone?: (snapshot: JobProgressSnapshot) => Record<string, unknown>;
};

const POLL_INTERVAL_MS = 1_500;
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

export async function openJobSseStream(
  request: FastifyRequest,
  reply: FastifyReply,
  app: FastifyInstance,
  trackingId: string,
  initialSnapshot: JobProgressSnapshot,
  formatters?: StreamFormatters,
): Promise<void> {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let lastEventCount = 0;
  const writeEvent = (event: JobProgressEvent, snapshot: JobProgressSnapshot) => {
    const data = formatters?.formatEvent
      ? formatters.formatEvent(event, snapshot)
      : event;
    if (data === null) return;
    if (reply.raw.writableEnded) return;
    reply.raw.write(`event: progress\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const writeDone = (snapshot: JobProgressSnapshot) => {
    const data = formatters?.formatDone
      ? formatters.formatDone(snapshot)
      : { trackingId };
    if (reply.raw.writableEnded) return;
    reply.raw.write(`event: done\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const alreadyDone =
    initialSnapshot.status === "completed" ||
    initialSnapshot.status === "failed";

  // ponytail: late subscribers get the final snapshot only, not a history replay
  if (alreadyDone && formatters?.formatDone) {
    writeDone(initialSnapshot);
    reply.raw.end();
    return;
  }

  for (const event of initialSnapshot.events) {
    writeEvent(event, initialSnapshot);
  }
  lastEventCount = initialSnapshot.events.length;

  if (alreadyDone) {
    writeDone(initialSnapshot);
    reply.raw.end();
    return;
  }

  const useDbPoll =
    useCloudflarePublishDispatch() && (await hasPublishJobTables());
  let subscriber: ReturnType<
    FastifyInstance["jobProgress"]["subscribe"]
  > | null = null;

  let closed = false;
  const stopTimers: Array<() => void> = [];

  /**
   * Idempotent, and must never reject: every caller is a `void cleanup()` from
   * a timer or an event handler, where a rejection becomes an unhandled one.
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
  };

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
    const poll = setInterval(async () => {
      if (closed || polling) return;
      polling = true;
      try {
        const snapshot = await resolveJobSnapshot(app, trackingId);
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

  request.raw.on("close", () => {
    void cleanup();
  });
}
