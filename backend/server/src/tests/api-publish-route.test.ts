import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockEnqueue,
  mockReserve,
  mockRelease,
  mockScheduledWebhook,
  PostClaimLostError,
  state,
} = vi.hoisted(() => {
  class PostClaimLostError extends Error {}
  return {
    PostClaimLostError,
    mockDb: {
      select: vi.fn(),
      update: vi.fn(),
      query: { userSettings: { findFirst: vi.fn() } },
    },
    mockEnqueue: vi.fn(),
    mockReserve: vi.fn(),
    mockRelease: vi.fn(),
    mockScheduledWebhook: vi.fn(),
    state: {
      /** `posts.status` as the route reads it. */
      status: "draft" as string,
      /** Whether the conditional schedule UPDATE matches a row. */
      updateMatches: true,
      /** `set()` values of every UPDATE that matched. */
      updates: [] as Record<string, unknown>[],
    },
  };
});

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../middleware/auth.js", () => ({
  resolveRequestActor: vi
    .fn()
    .mockResolvedValue({ userId: "user-1", source: "session" }),
  unauthorized: () => ({ error: "Unauthorized" }),
}));
vi.mock("../lib/workspace/session.js", () => ({
  requireWorkspacePermissionForActor: vi.fn().mockResolvedValue({
    ok: true,
    ctx: { resourceUserId: "user-1", workspaceId: null },
  }),
}));
vi.mock("../lib/workspace/context.js", () => ({
  postScopeCondition: () => undefined,
}));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  publishLimiter: null,
  rpcLimiter: null,
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../services/enqueue.js", () => ({
  createPublishTrackingId: () => "track-1",
  enqueuePublishPost: mockEnqueue,
  queueNameForJob: () => "social0-publish-now",
  useCloudflarePublishDispatch: () => true,
}));
vi.mock("../services/publish-enqueue.js", () => ({ PostClaimLostError }));
vi.mock("../services/posts.js", () => ({
  reserveFreePostQuota: mockReserve,
  // The real window: no more than two minutes past, no more than a year out.
  validateScheduledAtWindow: (at: Date) => {
    const t = at.getTime();
    if (t < Date.now() - 120_000) return "Scheduled time must be in the future";
    if (t > Date.now() + 365 * 24 * 60 * 60 * 1000) {
      return "Scheduled time must be within the next 1 year";
    }
    return null;
  },
}));
vi.mock("../lib/plan-limits.js", () => ({ releaseFreePost: mockRelease }));
vi.mock("../lib/post-lifecycle-webhooks.js", () => ({
  emitPostScheduledWebhook: mockScheduledWebhook,
}));
vi.mock("../lib/job-sse-stream.js", () => ({ openJobSseStream: vi.fn() }));
vi.mock("../lib/resolve-job-snapshot.js", () => ({
  resolveJobSnapshot: vi.fn(),
}));

import { registerPublishRoutes } from "../routes/api/publish.js";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const RESERVATION = { allowed: true, consumed: true };

function wireDb() {
  state.updates = [];
  mockDb.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: POST_ID, status: state.status }],
      }),
    }),
  }));
  mockDb.update.mockImplementation(() => ({
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          if (!state.updateMatches) return [];
          state.updates.push(values);
          return [{ id: POST_ID }];
        },
      }),
    }),
  }));
  mockDb.query.userSettings.findFirst.mockResolvedValue({
    timezone: "America/Los_Angeles",
  });
}

async function publish(body: Record<string, unknown>) {
  const app = Fastify();
  await registerPublishRoutes(app);
  const res = await app.inject({
    method: "POST",
    url: "/publish",
    payload: { postId: POST_ID, ...body },
  });
  await app.close();
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}

/** `YYYY-MM-DDTHH:mm:ss` wall time of `date` in `timeZone`. */
function wallTime(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.status = "draft";
  state.updateMatches = true;
  wireDb();
  mockReserve.mockResolvedValue({ ok: true, reservation: RESERVATION });
  mockRelease.mockResolvedValue(undefined);
  mockEnqueue.mockResolvedValue({ id: "track-1", backend: "cloudflare", enqueued: 2 });
});

describe("POST /api/publish charges the free-post quota like every other publish path", () => {
  it("charges a draft published now and claims it only while it is a draft", async () => {
    const res = await publish({ mode: "now" });

    expect(res.status).toBe(202);
    expect(mockReserve).toHaveBeenCalledWith("user-1", POST_ID);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ postId: POST_ID, userId: "user-1" }),
      expect.objectContaining({ onlyFromStatus: "draft" }),
    );
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("refuses to publish a draft once the free posts are used up", async () => {
    mockReserve.mockResolvedValue({ ok: false, error: "You've used your free posts." });

    const res = await publish({ mode: "now" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FREE_POST_LIMIT");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does not charge again for a post that was charged when it was scheduled", async () => {
    state.status = "scheduled";

    const res = await publish({ mode: "now" });

    expect(res.status).toBe(202);
    expect(mockReserve).not.toHaveBeenCalled();
    expect(mockEnqueue.mock.calls[0]![2]).toMatchObject({ onlyFromStatus: undefined });
  });

  it("refunds and reports a conflict when a racing request claimed the draft first", async () => {
    mockEnqueue.mockRejectedValue(new PostClaimLostError("lost"));

    const res = await publish({ mode: "now" });

    expect(res.status).toBe(409);
    expect(mockRelease).toHaveBeenCalledWith(RESERVATION, "user-1");
  });

  it("refunds when nothing was dispatched and the post is a draft again", async () => {
    mockEnqueue.mockRejectedValue(new Error("publish worker unreachable"));

    const res = await publish({ mode: "now" });

    expect(res.status).toBe(500);
    expect(mockRelease).toHaveBeenCalledWith(RESERVATION, "user-1");
  });

  it("keeps the charge when part of the fan-out went out", async () => {
    mockEnqueue.mockImplementation(async () => {
      state.status = "publishing";
      throw new Error("second platform failed to queue");
    });

    const res = await publish({ mode: "now" });

    expect(res.status).toBe(500);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("charges a draft that is scheduled", async () => {
    const at = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await publish({ mode: "schedule", scheduledAt: at });

    expect(res.status).toBe(200);
    expect(mockReserve).toHaveBeenCalledWith("user-1", POST_ID);
    expect(state.updates).toEqual([
      expect.objectContaining({ status: "scheduled" }),
    ]);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("refunds a scheduled draft that another request moved first", async () => {
    state.updateMatches = false;
    const at = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await publish({ mode: "schedule", scheduledAt: at });

    expect(res.status).toBe(409);
    expect(mockRelease).toHaveBeenCalledWith(RESERVATION, "user-1");
    expect(mockScheduledWebhook).not.toHaveBeenCalled();
  });

  it("does not charge to reschedule a scheduled post", async () => {
    state.status = "scheduled";
    const at = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await publish({ mode: "schedule", scheduledAt: at });

    expect(res.status).toBe(200);
    expect(mockReserve).not.toHaveBeenCalled();
  });
});

describe("POST /api/publish publishes the whole post", () => {
  it("refuses a subset of the post's accounts instead of stranding the rest", async () => {
    const res = await publish({ mode: "now", connectedAccountIds: ["acct-x"] });

    expect(res.status).toBe(400);
    expect(mockReserve).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("never narrows the fan-out it hands to the enqueue", async () => {
    const res = await publish({ mode: "now", connectedAccountIds: [] });

    expect(res.status).toBe(202);
    expect(mockEnqueue.mock.calls[0]![1]).not.toHaveProperty("connectedAccountIds");
  });
});

describe("POST /api/publish decides schedule vs now from the resolved time", () => {
  it("schedules a `+default` time instead of publishing it now", async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const naive = wallTime(future, "America/Los_Angeles");

    const res = await publish({ scheduledAt: `${naive}+default` });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("scheduled");
    expect(mockEnqueue).not.toHaveBeenCalled();
    // Resolved in the user's dashboard timezone, to the second.
    expect(
      Math.abs(new Date(res.body.scheduledAt as string).getTime() - future.getTime()),
    ).toBeLessThan(1000);
  });

  it("schedules a naive time in the given timezone even when it reads as past in UTC", async () => {
    // An hour from now in Los Angeles, which `new Date()` would read as a UTC
    // wall time 7–8 hours in the past.
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const naive = wallTime(future, "America/Los_Angeles");

    const res = await publish({ scheduledAt: naive, timezone: "America/Los_Angeles" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("scheduled");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("rejects an unreadable time instead of publishing now", async () => {
    const res = await publish({ scheduledAt: "next tuesday" });

    expect(res.status).toBe(400);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it("rejects a time more than a year out", async () => {
    const at = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();

    const res = await publish({ scheduledAt: at });

    expect(res.status).toBe(400);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it("still publishes now when no mode is given and the time has passed", async () => {
    const at = new Date(Date.now() - 60 * 1000).toISOString();

    const res = await publish({ scheduledAt: at });

    expect(res.status).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("publishes now when mode is now, whatever scheduledAt says", async () => {
    const res = await publish({ mode: "now", scheduledAt: "garbage" });

    expect(res.status).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
});
