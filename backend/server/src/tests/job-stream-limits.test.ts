/**
 * Job SSE streams are budgeted and capped per user.
 *
 * Each open stream polls Postgres every 1.5s (Cloudflare dispatch) or holds
 * its own Redis subscriber (BullMQ) for up to 15 minutes. `GET
 * /api/jobs/:id/stream` used to check only that the caller could read the
 * job, so one script holding a few hundred streams on one running job put
 * ~1000 queries/s on the shared database. Opens now go through a per-minute
 * budget and a per-user concurrency cap, and every way a stream ends hands
 * its slot back.
 */

import Fastify, { type FastifyInstance } from "fastify";
import type { JobProgressSnapshot } from "@social0/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnforce, mockSnapshot, state } = vi.hoisted(() => ({
  mockEnforce: vi.fn(),
  mockSnapshot: vi.fn(),
  state: { status: "processing" as string },
}));

vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  rpcLimiter: null,
  publishLimiter: null,
  enforceRateLimit: mockEnforce,
}));
vi.mock("../lib/publish-job-tracking.js", () => ({
  hasPublishJobTables: vi.fn(async () => true),
}));
vi.mock("../lib/resolve-job-snapshot.js", () => ({
  resolveJobSnapshot: mockSnapshot,
}));
vi.mock("../services/publish-dispatch.js", () => ({
  useCloudflarePublishDispatch: vi.fn(() => true),
}));
vi.mock("../middleware/auth.js", () => ({
  resolveRequestActor: vi
    .fn()
    .mockResolvedValue({ userId: "user-1", source: "session" }),
  unauthorized: () => ({ error: "Unauthorized" }),
}));
vi.mock("../lib/workspace/session.js", () => ({
  requireWorkspacePermissionForActor: vi.fn(),
}));
// The rest of publish.ts's import graph; none of it runs on the job routes.
vi.mock("../db/index.js", () => ({ db: {} }));
vi.mock("../lib/workspace/context.js", () => ({ postScopeCondition: vi.fn() }));
vi.mock("../services/enqueue.js", () => ({
  createPublishTrackingId: vi.fn(),
  enqueuePublishPost: vi.fn(),
  queueNameForJob: vi.fn(),
}));
vi.mock("../services/publish-enqueue.js", () => ({
  PostClaimLostError: class extends Error {},
}));
vi.mock("../services/posts.js", () => ({
  reserveFreePostQuota: vi.fn(),
  validateScheduledAtWindow: vi.fn(),
}));
vi.mock("../lib/plan-limits.js", () => ({ releaseFreePost: vi.fn() }));
vi.mock("../lib/post-lifecycle-webhooks.js", () => ({
  emitPostScheduledWebhook: vi.fn(),
}));

const {
  admitJobStream,
  openJobSseStream,
  openJobStreamCount,
  MAX_JOB_STREAMS_PER_USER,
} = await import("../lib/job-sse-stream.js");
const { registerJobRoutes } = await import("../routes/api/publish.js");

function snapshot(status = state.status): JobProgressSnapshot {
  return {
    trackingId: "trk_1",
    userId: "user-1",
    status,
    events: [],
  } as unknown as JobProgressSnapshot;
}

let app: FastifyInstance | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  state.status = "processing";
  mockEnforce.mockResolvedValue({ allowed: true });
  mockSnapshot.mockImplementation(async () => snapshot());
});

afterEach(async () => {
  await app?.close();
  app = null;
});

describe("admitJobStream", () => {
  it("caps concurrent streams per user and frees a slot on release", async () => {
    const releases: Array<() => void> = [];
    for (let i = 0; i < MAX_JOB_STREAMS_PER_USER; i++) {
      const admit = await admitJobStream("cap-user", "k");
      expect(admit.allowed).toBe(true);
      if (admit.allowed) releases.push(admit.release);
    }

    const over = await admitJobStream("cap-user", "k");
    expect(over).toMatchObject({ allowed: false, status: 429 });
    // Another user is not affected.
    const other = await admitJobStream("other-user", "k");
    expect(other.allowed).toBe(true);
    if (other.allowed) other.release();

    // Release is idempotent: a double release must not free two slots.
    releases[0]!();
    releases[0]!();
    expect(openJobStreamCount("cap-user")).toBe(MAX_JOB_STREAMS_PER_USER - 1);
    expect((await admitJobStream("cap-user", "k")).allowed).toBe(true);
    expect((await admitJobStream("cap-user", "k")).allowed).toBe(false);

    for (const release of releases) release();
  });

  it("refuses when the open budget is spent, without taking a slot", async () => {
    mockEnforce.mockResolvedValueOnce({
      allowed: false,
      status: 429,
      error: "Too many requests. Try again later.",
    });
    const admit = await admitJobStream("budget-user", "jobstream:budget-user");
    expect(admit).toMatchObject({ allowed: false, status: 429 });
    expect(openJobStreamCount("budget-user")).toBe(0);
    expect(mockEnforce).toHaveBeenCalledWith(null, "jobstream:budget-user");
  });
});

describe("openJobSseStream", () => {
  it("hands the slot back when the job is already finished", async () => {
    const admit = await admitJobStream("done-user", "k");
    if (!admit.allowed) throw new Error("not admitted");
    app = Fastify();
    app.get("/s", async (request, reply) => {
      await openJobSseStream(request, reply, app!, "trk_1", snapshot("completed"), {
        release: admit.release,
      });
    });
    const res = await app.inject({ method: "GET", url: "/s" });
    expect(res.body).toContain("event: done");
    expect(openJobStreamCount("done-user")).toBe(0);
  });

  it("hands the slot back when a live stream finishes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    try {
      const admit = await admitJobStream("live-user", "k");
      if (!admit.allowed) throw new Error("not admitted");
      app = Fastify();
      app.get("/s", async (request, reply) => {
        await openJobSseStream(request, reply, app!, "trk_1", snapshot(), {
          release: admit.release,
        });
      });
      const pending = app.inject({ method: "GET", url: "/s" });
      await vi.waitFor(() => expect(openJobStreamCount("live-user")).toBe(1));

      state.status = "completed";
      await vi.advanceTimersByTimeAsync(1_600);
      const res = await pending;
      expect(res.body).toContain("event: done");
      expect(openJobStreamCount("live-user")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GET /jobs/:trackingId/stream", () => {
  it("answers 429 past the per-user cap instead of opening another stream", async () => {
    const held: Array<() => void> = [];
    for (let i = 0; i < MAX_JOB_STREAMS_PER_USER; i++) {
      const admit = await admitJobStream("user-1", "k");
      if (admit.allowed) held.push(admit.release);
    }
    try {
      app = Fastify();
      await registerJobRoutes(app);
      const res = await app.inject({ method: "GET", url: "/jobs/trk_1/stream" });
      expect(res.statusCode).toBe(429);
      expect(res.headers["content-type"]).not.toContain("text/event-stream");
      expect(mockEnforce).toHaveBeenCalledWith(null, "jobstream:user-1");
    } finally {
      for (const release of held) release();
    }
    expect(openJobStreamCount("user-1")).toBe(0);
  });

  it("answers 429 when the open budget is spent", async () => {
    mockEnforce.mockResolvedValueOnce({
      allowed: false,
      status: 429,
      error: "Too many requests. Try again later.",
    });
    app = Fastify();
    await registerJobRoutes(app);
    const res = await app.inject({ method: "GET", url: "/jobs/trk_1/stream" });
    expect(res.statusCode).toBe(429);
    expect(openJobStreamCount("user-1")).toBe(0);
  });
});

describe("GET /jobs/:trackingId", () => {
  it("is budgeted per user", async () => {
    mockEnforce.mockResolvedValueOnce({
      allowed: false,
      status: 429,
      error: "Too many requests. Try again later.",
    });
    app = Fastify();
    await registerJobRoutes(app);
    const res = await app.inject({ method: "GET", url: "/jobs/trk_1" });
    expect(res.statusCode).toBe(429);
    expect(mockEnforce).toHaveBeenCalledWith(null, "jobs:user-1");
    expect(mockSnapshot).not.toHaveBeenCalled();
  });
});
