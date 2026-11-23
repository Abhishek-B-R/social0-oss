/**
 * `POST /v1/posts` (draft) and `POST /v1/posts/schedule` honour
 * Idempotency-Key. Before, only the publish routes did: an agent retrying a
 * schedule call after a timeout created a second scheduled post, and both
 * published.
 */

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, mockCreateDraft, mockCreateAndSchedule, mockResolveScheduledAt } = vi.hoisted(
  () => ({
    store: new Map<string, string>(),
    mockCreateDraft: vi.fn(),
    mockCreateAndSchedule: vi.fn(),
    mockResolveScheduledAt: vi.fn(),
  }),
);

vi.mock("../lib/redis.js", () => ({
  redis: {
    get: async (key: string) => {
      const raw = store.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    },
    set: async (key: string, value: string, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, typeof value === "string" ? value : JSON.stringify(value));
      return "OK";
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
  },
}));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  enforceRateLimit: vi.fn(async () => ({ allowed: true })),
  publishLimiter: {},
}));
vi.mock("../middleware/api-auth.js", () => ({
  requireV1ApiKey: vi.fn(async (request: { v1Auth?: unknown }) => {
    request.v1Auth = { userId: "user-1" };
    (request as { v1Workspace?: unknown }).v1Workspace = { resourceUserId: "user-1", workspaceId: null, actorUserId: "user-1" };
  }),
  v1UserId: (request: { v1Auth?: { userId: string } }) => request.v1Auth!.userId,
}));
vi.mock("../lib/resolve-scheduled-at.js", () => ({
  resolveScheduledAt: mockResolveScheduledAt,
}));
vi.mock("../lib/publish-timeline.js", () => ({
  loadPublishTimelineForOwnedPost: vi.fn(),
}));
vi.mock("../lib/post-source.js", () => ({
  resolveV1PostSource: vi.fn(async () => null),
}));
vi.mock("../services/v1-posts.js", () => ({
  v1CreateAndPublish: vi.fn(),
  v1CreateAndSchedule: mockCreateAndSchedule,
  v1CreateDraft: mockCreateDraft,
  v1DeletePost: vi.fn(),
  v1GetPost: vi.fn(),
  v1ListPosts: vi.fn(),
  v1PublishPost: vi.fn(),
  v1SchedulePost: vi.fn(),
  v1UpdateDraft: vi.fn(),
}));

import { registerPostsRoutes } from "../routes/v1/posts.js";

const ACCOUNT_ID = "66666666-6666-4666-8666-666666666666";
const AT = "2026-12-01T10:00:00.000Z";

let app: FastifyInstance;
let created = 0;

beforeEach(async () => {
  vi.clearAllMocks();
  store.clear();
  created = 0;
  mockCreateDraft.mockImplementation(async () => ({ ok: true, id: `draft-${++created}` }));
  mockCreateAndSchedule.mockImplementation(async () => ({
    ok: true,
    post_id: `sched-${++created}`,
    scheduled_at: AT,
  }));
  mockResolveScheduledAt.mockResolvedValue({ ok: true, utc: new Date(AT) });
  app = Fastify();
  await app.register(registerPostsRoutes, { prefix: "/v1" });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

function post(url: string, payload: Record<string, unknown>, key?: string) {
  return app.inject({
    method: "POST",
    url,
    payload,
    headers: key ? { "idempotency-key": key } : {},
  });
}

const draftBody = { content: "hello", accounts: [ACCOUNT_ID] };
const scheduleBody = { ...draftBody, scheduledAt: AT };

describe("Idempotency-Key on /v1 creates", () => {
  it("creates one draft for a retried POST /v1/posts", async () => {
    const first = await post("/v1/posts", draftBody, "k-1");
    const retry = await post("/v1/posts", draftBody, "k-1");

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toEqual(first.json());
  });

  it("creates one scheduled post for a retried POST /v1/posts/schedule", async () => {
    await post("/v1/posts/schedule", scheduleBody, "k-2");
    const retry = await post("/v1/posts/schedule", scheduleBody, "k-2");

    expect(mockCreateAndSchedule).toHaveBeenCalledTimes(1);
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toEqual({ post_id: "sched-1", scheduled_at: AT, status: "scheduled" });
  });

  it("rejects the same key reused for a different schedule body", async () => {
    await post("/v1/posts/schedule", scheduleBody, "k-3");
    const reused = await post("/v1/posts/schedule", { ...scheduleBody, content: "other" }, "k-3");

    expect(mockCreateAndSchedule).toHaveBeenCalledTimes(1);
    expect(reused.statusCode).toBe(422);
    expect(reused.json()).toMatchObject({ error: { code: "idempotency_key_reused" } });
  });

  it("keeps a key on one create route from replaying another", async () => {
    await post("/v1/posts", draftBody, "k-4");
    const schedule = await post("/v1/posts/schedule", scheduleBody, "k-4");

    expect(schedule.statusCode).toBe(201);
    expect(mockCreateAndSchedule).toHaveBeenCalledTimes(1);
  });

  it("creates again without a key", async () => {
    await post("/v1/posts", draftBody);
    await post("/v1/posts", draftBody);

    expect(mockCreateDraft).toHaveBeenCalledTimes(2);
  });

  it("still answers validation errors with 400", async () => {
    const res = await post("/v1/posts", { content: "x" }, "k-5");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "validation_error" } });
  });
});
