/**
 * `POST /v1/posts/:id/publish` and `POST /v1/posts/publish`:
 *
 * - They spend the same per-user `publishLimiter` budget as the dashboard RPC
 *   and `POST /api/publish`. Before, their only cap was the hourly tier
 *   request budget (thousands an hour), so the publish cap depended on which
 *   door a caller used.
 * - A partial fan-out answers 202 with the job and a warning instead of 500,
 *   and a publish that sent nothing answers 503 (safe to retry, and never
 *   stored under an Idempotency-Key).
 */

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enforceRateLimit, mockPublish, mockCreateAndPublish } = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  mockPublish: vi.fn(),
  mockCreateAndPublish: vi.fn(),
}));

vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  enforceRateLimit,
  publishLimiter: { kind: "publish" },
}));
vi.mock("../middleware/api-auth.js", () => ({
  requireV1ApiKey: vi.fn(async (request: { v1Auth?: unknown }) => {
    request.v1Auth = { userId: "user-1" };
  }),
  v1UserId: (request: { v1Auth?: { userId: string } }) =>
    request.v1Auth!.userId,
}));
vi.mock("../lib/resolve-scheduled-at.js", () => ({ resolveScheduledAt: vi.fn() }));
vi.mock("../lib/publish-timeline.js", () => ({
  loadPublishTimelineForOwnedPost: vi.fn(),
}));
vi.mock("../lib/post-source.js", () => ({
  resolveV1PostSource: vi.fn(async () => null),
}));
vi.mock("../services/v1-posts.js", () => ({
  v1CreateAndPublish: mockCreateAndPublish,
  v1CreateAndSchedule: vi.fn(),
  v1CreateDraft: vi.fn(),
  v1DeletePost: vi.fn(),
  v1GetPost: vi.fn(),
  v1ListPosts: vi.fn(),
  v1PublishPost: mockPublish,
  v1SchedulePost: vi.fn(),
  v1UpdateDraft: vi.fn(),
}));

import { registerPostsRoutes } from "../routes/v1/posts.js";

const POST_ID = "55555555-5555-4555-8555-555555555555";
const ACCOUNT_ID = "66666666-6666-4666-8666-666666666666";
const WARNING = "Some accounts couldn't be queued.";

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  enforceRateLimit.mockResolvedValue({ allowed: true });
  app = Fastify();
  await app.register(registerPostsRoutes, { prefix: "/v1" });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

function publishExisting() {
  return app.inject({ method: "POST", url: `/v1/posts/${POST_ID}/publish` });
}

function createAndPublish() {
  return app.inject({
    method: "POST",
    url: "/v1/posts/publish",
    payload: { content: "hello", accounts: [ACCOUNT_ID] },
  });
}

describe("/v1 publish budget", () => {
  it.each([
    ["POST /v1/posts/:id/publish", publishExisting],
    ["POST /v1/posts/publish", createAndPublish],
  ])("%s spends the shared per-user publish budget", async (_name, call) => {
    mockPublish.mockResolvedValue({
      ok: true,
      tracking_id: "track-1",
      status: "queued",
      stream_url: "/v1/jobs/track-1/stream",
    });
    mockCreateAndPublish.mockResolvedValue({
      ok: true,
      post_id: POST_ID,
      tracking_id: "track-1",
      stream_url: "/v1/jobs/track-1/stream",
    });

    const res = await call();

    expect(res.statusCode).toBe(202);
    // Not namespaced: the same bucket the dashboard and /api/publish spend.
    expect(enforceRateLimit).toHaveBeenCalledWith({ kind: "publish" }, "user-1");
  });

  it.each([
    ["POST /v1/posts/:id/publish", publishExisting],
    ["POST /v1/posts/publish", createAndPublish],
  ])("%s answers 429 with Retry-After once the budget is spent", async (_name, call) => {
    enforceRateLimit.mockResolvedValue({
      allowed: false,
      status: 429,
      error: "Too many requests. Try again later.",
      reset: Date.now() + 120_000,
    });

    const res = await call();

    expect(res.statusCode).toBe(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(res.json()).toEqual({
      error: {
        code: "rate_limit_exceeded",
        message: "Too many requests. Try again later.",
      },
    });
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockCreateAndPublish).not.toHaveBeenCalled();
  });

  it("does not spend the budget on non-publish routes", async () => {
    await app.inject({ method: "GET", url: `/v1/posts/${POST_ID}` });
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });
});

describe("/v1 publish outcomes", () => {
  it("returns the job and the warning after a partial fan-out", async () => {
    mockPublish.mockResolvedValue({
      ok: true,
      tracking_id: "track-1",
      status: "queued",
      stream_url: "/v1/jobs/track-1/stream",
      warning: WARNING,
    });

    const res = await publishExisting();

    expect(res.statusCode).toBe(202);
    expect(res.headers.location).toBe("/v1/jobs/track-1");
    expect(res.json()).toEqual({
      tracking_id: "track-1",
      status: "queued",
      stream_url: "/v1/jobs/track-1/stream",
      warning: WARNING,
    });
  });

  it("create-and-publish returns the post and job with the warning", async () => {
    mockCreateAndPublish.mockResolvedValue({
      ok: true,
      post_id: POST_ID,
      tracking_id: "track-1",
      stream_url: "/v1/jobs/track-1/stream",
      warning: WARNING,
    });

    const res = await createAndPublish();

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({
      post_id: POST_ID,
      tracking_id: "track-1",
      status: "queued",
      stream_url: "/v1/jobs/track-1/stream",
      warning: WARNING,
    });
  });

  it.each([
    ["POST /v1/posts/:id/publish", publishExisting, mockPublish],
    ["POST /v1/posts/publish", createAndPublish, mockCreateAndPublish],
  ])("%s answers 503 when nothing went out", async (_name, call, mock) => {
    mock.mockResolvedValue({
      ok: false,
      error: "Couldn't reach the publishing service.",
      unavailable: true,
    });

    const res = await call();

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: {
        code: "internal_error",
        message: "Couldn't reach the publishing service.",
      },
    });
  });

  it("keeps 400 for an ordinary refusal", async () => {
    mockCreateAndPublish.mockResolvedValue({
      ok: false,
      error: "Free post limit reached. Upgrade to continue.",
    });

    const res = await createAndPublish();

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");
  });
});
