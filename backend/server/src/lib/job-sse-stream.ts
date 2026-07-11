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
    reply.raw.write(`event: progress\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const writeDone = (snapshot: JobProgressSnapshot) => {
    const data = formatters?.formatDone
      ? formatters.formatDone(snapshot)
      : { trackingId };
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

  if (!useDbPoll) {
    subscriber = app.jobProgress.subscribe(trackingId, async (event) => {
      const snapshot = (await resolveJobSnapshot(app, trackingId)) ?? initialSnapshot;
      writeEvent(event, snapshot);
      if (event.phase === "completed" || event.phase === "failed") {
        writeDone(snapshot);
        void cleanup();
      }
    });
  }

  const pollDb = useDbPoll
    ? setInterval(async () => {
        const snapshot = await resolveJobSnapshot(app, trackingId);
        if (!snapshot) return;
        const newEvents = snapshot.events.slice(lastEventCount);
        for (const event of newEvents) {
          writeEvent(event, snapshot);
        }
        lastEventCount = snapshot.events.length;
        if (snapshot.status === "completed" || snapshot.status === "failed") {
          writeDone(snapshot);
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
