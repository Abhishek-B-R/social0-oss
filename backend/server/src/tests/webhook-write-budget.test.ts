/**
 * Webhook create / update resolve DNS for a user-supplied hostname. The
 * regression this pins: the dashboard routes had no rate limit at all and the
 * `/v1` twins only the hourly tier limit, and create resolved the URL before
 * the endpoint-cap check, so a user at the cap could still drive unbounded
 * DNS lookups. Both surfaces now spend the per-minute mutation budget first,
 * and create counts before it resolves.
 */

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mocks, state } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mocks: {
    allowedUrl: vi.fn(),
    enforceRateLimit: vi.fn(),
    v1Budget: vi.fn(),
  },
  state: { subscriptionCount: 0 },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../middleware/auth.js", () => ({
  requireUserId: vi.fn(async () => "user-1"),
  resolveRequestActor: vi.fn(async () => ({ userId: "user-1" })),
}));
vi.mock("../middleware/api-auth.js", () => ({
  requireV1ApiKey: vi.fn(async (request: { v1Auth?: unknown }) => {
    request.v1Auth = { userId: "user-1" };
  }),
  v1UserId: (request: { v1Auth?: { userId: string } }) =>
    request.v1Auth!.userId,
}));
vi.mock("../lib/ratelimit.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ratelimit.js")>()),
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("../middleware/v1-live-limits.js", () => ({
  requireV1MutationBudget: mocks.v1Budget,
}));
vi.mock("../lib/webhook-url.js", () => ({
  isAllowedWebhookUrl: mocks.allowedUrl,
}));

import { registerApiPlatformRoutes } from "../routes/api/api-platform.js";
import { registerWebhooksRoutes } from "../routes/v1/webhooks.js";

const WEBHOOK_ID = "5f0c2f4e-8a59-4d6b-9a6f-3f1f2a0b9c11";
const HOOK_URL = "https://hooks.example.com/in";

/** Drizzle-ish builder: every method returns itself, awaiting yields `result`. */
function chain(result: () => unknown) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (
            onFulfilled: (v: unknown) => unknown,
            onRejected: (e: unknown) => unknown,
          ) => Promise.resolve(result()).then(onFulfilled, onRejected);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

const row = {
  id: WEBHOOK_ID,
  url: HOOK_URL,
  events: ["post.published"],
  active: true,
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  state.subscriptionCount = 0;
  mocks.allowedUrl.mockResolvedValue(true);
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
  mocks.v1Budget.mockResolvedValue(undefined);
  mockDb.select.mockImplementation(() =>
    chain(() => [{ count: state.subscriptionCount }]),
  );
  mockDb.insert.mockImplementation(() => chain(() => [row]));
  mockDb.update.mockImplementation(() => chain(() => [row]));

  app = Fastify();
  await app.register(registerApiPlatformRoutes, { prefix: "/api" });
  await app.register(registerWebhooksRoutes, { prefix: "/v1" });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const createBody = { url: HOOK_URL, events: ["post.published"] };

describe("dashboard webhook writes", () => {
  it.each([
    ["POST", "/api/webhooks/subscriptions", createBody],
    ["PATCH", `/api/webhooks/subscriptions/${WEBHOOK_ID}`, { url: HOOK_URL }],
  ] as const)(
    "%s %s spends the mutation budget before resolving the URL",
    async (method, url, payload) => {
      mocks.enforceRateLimit.mockResolvedValue({
        allowed: false,
        status: 429,
        error: "Too many requests",
      });

      const res = await app.inject({ method, url, payload });

      expect(res.statusCode).toBe(429);
      expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        "webhook-write:user-1",
      );
      expect(mocks.allowedUrl).not.toHaveBeenCalled();
    },
  );

  it("does not resolve the URL once the endpoint cap is reached", async () => {
    state.subscriptionCount = 20;

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/subscriptions",
      payload: createBody,
    });

    expect(res.statusCode).toBe(409);
    expect(mocks.allowedUrl).not.toHaveBeenCalled();
  });

  it("still creates and updates within budget", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/webhooks/subscriptions",
      payload: createBody,
    });
    expect(created.statusCode).toBe(200);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/webhooks/subscriptions/${WEBHOOK_ID}`,
      payload: { url: HOOK_URL },
    });
    expect(updated.statusCode).toBe(200);
    expect(mocks.allowedUrl).toHaveBeenCalledTimes(2);
  });
});

describe("/v1 webhook writes", () => {
  it.each([
    ["POST", "/v1/webhooks", createBody],
    ["PATCH", `/v1/webhooks/${WEBHOOK_ID}`, { url: HOOK_URL }],
  ] as const)(
    "%s %s sits behind the per-minute mutation budget",
    async (method, url, payload) => {
      mocks.v1Budget.mockImplementation(
        async (
          _request,
          reply: { status: (n: number) => { send: (b: unknown) => unknown } },
        ) => reply.status(429).send({ error: { code: "rate_limit_exceeded" } }),
      );

      const res = await app.inject({ method, url, payload });

      expect(res.statusCode).toBe(429);
      expect(mocks.v1Budget).toHaveBeenCalledTimes(1);
      expect(mocks.allowedUrl).not.toHaveBeenCalled();
    },
  );

  it("does not resolve the URL once the endpoint cap is reached", async () => {
    state.subscriptionCount = 20;

    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      payload: createBody,
    });

    expect(res.statusCode).toBe(409);
    expect(mocks.allowedUrl).not.toHaveBeenCalled();
  });
});
