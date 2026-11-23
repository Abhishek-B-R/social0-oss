import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { JobProgressSnapshot } from "@social0/shared";

vi.mock("../lib/publish-job-tracking.js", () => ({
  hasPublishJobTables: vi.fn(async () => false),
}));
vi.mock("../lib/resolve-job-snapshot.js", () => ({
  resolveJobSnapshot: vi.fn(async () => null),
}));
vi.mock("../services/publish-dispatch.js", () => ({
  useCloudflarePublishDispatch: vi.fn(() => false),
}));

const { openJobSseStream, sseResponseHeaders } = await import(
  "../lib/job-sse-stream.js"
);

const ORIGIN = "https://social0.app";

function completedSnapshot(): JobProgressSnapshot {
  return {
    trackingId: "trk_1",
    userId: "user_1",
    status: "completed",
    events: [],
  } as unknown as JobProgressSnapshot;
}

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  await instance.register(cors, {
    origin: (origin, cb) => cb(null, origin === ORIGIN),
    credentials: true,
  });
  instance.get("/stream", async (request, reply) => {
    await openJobSseStream(request, reply, instance, "trk_1", completedSnapshot(), {
      formatDone: (s) => ({ id: s.trackingId, status: s.status }),
    });
  });
  await instance.ready();
  return instance;
}

describe("openJobSseStream", () => {
  it("keeps the CORS headers @fastify/cors set before the reply was hijacked", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stream",
      headers: { origin: ORIGIN },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.headers["cache-control"]).toBe("no-cache, no-transform");
    expect(res.body).toContain("event: done");
  });

  it("does not grant CORS to an origin the policy rejected", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stream",
      headers: { origin: "https://evil.example" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("sseResponseHeaders", () => {
  it("lets SSE framing win and drops content-length", () => {
    const headers = sseResponseHeaders({
      getHeaders: () => ({
        "content-type": "application/json",
        "content-length": 42,
        "access-control-allow-origin": ORIGIN,
        vary: "Origin",
      }),
    });

    expect(headers["content-type"]).toBe("text/event-stream");
    expect(headers["content-length"]).toBeUndefined();
    expect(headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(headers.vary).toBe("Origin");
  });
});
