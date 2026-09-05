/**
 * `/v1` live analytics / inbox routes sit behind the same per-minute budgets
 * as the dashboard RPC. These pin the response contract of that gate.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceRateLimit = vi.fn();

vi.mock("../lib/ratelimit.js", () => ({
  enforceRateLimit,
  rpcLiveReadLimiter: { kind: "live" },
  rpcMutationLimiter: { kind: "mutation" },
}));

vi.mock("./../middleware/api-auth.js", () => ({
  v1UserId: () => "user-1",
}));

const {
  requireV1LiveReadBudget,
  requireV1MutationBudget,
  retryAfterSeconds,
} = await import("../middleware/v1-live-limits.js");

type FakeReply = {
  headers: Record<string, string>;
  statusCode: number | null;
  body: unknown;
  header: (k: string, v: string) => FakeReply;
  status: (code: number) => FakeReply;
  send: (body: unknown) => FakeReply;
};

function fakeReply(): FakeReply {
  const reply: FakeReply = {
    headers: {},
    statusCode: null,
    body: undefined,
    header(k, v) {
      reply.headers[k] = v;
      return reply;
    },
    status(code) {
      reply.statusCode = code;
      return reply;
    },
    send(body) {
      reply.body = body;
      return reply;
    },
  };
  return reply;
}

const request = {} as Parameters<typeof requireV1LiveReadBudget>[0];

beforeEach(() => {
  enforceRateLimit.mockReset();
});

describe("retryAfterSeconds", () => {
  it("rounds up to the next whole second", () => {
    expect(retryAfterSeconds(10_500, 10_000)).toBe(1);
    expect(retryAfterSeconds(12_001, 10_000)).toBe(3);
  });

  it("falls back to a minute when the limiter gave no reset", () => {
    expect(retryAfterSeconds(undefined)).toBe(60);
    expect(retryAfterSeconds(5_000, 10_000)).toBe(60);
  });
});

describe("v1 live budgets", () => {
  it("lets an allowed request through without touching the reply", async () => {
    enforceRateLimit.mockResolvedValue({ allowed: true });
    const reply = fakeReply();
    const out = await requireV1LiveReadBudget(
      request,
      reply as unknown as Parameters<typeof requireV1LiveReadBudget>[1],
    );
    expect(out).toBeUndefined();
    expect(reply.statusCode).toBeNull();
    expect(enforceRateLimit).toHaveBeenCalledWith(
      { kind: "live" },
      "v1:live:user-1",
    );
  });

  it("answers 429 with the typed error and a Retry-After", async () => {
    enforceRateLimit.mockResolvedValue({
      allowed: false,
      status: 429,
      error: "Too many requests. Try again later.",
      reset: Date.now() + 30_000,
    });
    const reply = fakeReply();
    await requireV1LiveReadBudget(
      request,
      reply as unknown as Parameters<typeof requireV1LiveReadBudget>[1],
    );
    expect(reply.statusCode).toBe(429);
    expect(reply.body).toEqual({
      error: {
        code: "rate_limit_exceeded",
        message: "Too many requests. Try again later.",
      },
    });
    const retry = Number(reply.headers["Retry-After"]);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(30);
  });

  it("passes a 503 (limiter unavailable) through without Retry-After", async () => {
    enforceRateLimit.mockResolvedValue({
      allowed: false,
      status: 503,
      error: "Rate limiting is unavailable. Try again later.",
    });
    const reply = fakeReply();
    await requireV1MutationBudget(
      request,
      reply as unknown as Parameters<typeof requireV1MutationBudget>[1],
    );
    expect(reply.statusCode).toBe(503);
    expect(reply.headers["Retry-After"]).toBeUndefined();
    expect(enforceRateLimit).toHaveBeenCalledWith(
      { kind: "mutation" },
      "v1:mutation:user-1",
    );
  });
});
