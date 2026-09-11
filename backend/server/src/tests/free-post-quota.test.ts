import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetSubscriptionForUser } = vi.hoisted(() => ({
  mockGetSubscriptionForUser: vi.fn(),
  mockDb: {
    query: { userSettings: { findFirst: vi.fn() } },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/subscription.js", () => ({
  getSubscriptionForUser: mockGetSubscriptionForUser,
}));
vi.mock("../lib/ratelimit.js", () => ({
  twitterPublishLimiter: null,
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { getPlanLimits } from "@social0/shared";
import { releaseFreePost, reserveFreePost } from "../lib/plan-limits.js";

const FREE_POST_LIMIT = getPlanLimits("free").maxFreePosts;

/**
 * Simulate the conditional UPDATE: the row is only returned while
 * `free_posts_used < limit`, which is what makes concurrent reservations safe.
 */
function mockCounter(initial: number, limit: number) {
  const state = { used: initial };
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });
  // reserveFreePost awaits `.returning()`; releaseFreePost awaits the builder
  // itself. Both land on this object, so each path gets its own behaviour.
  mockDb.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(async () => {
          if (state.used >= limit) return [];
          state.used += 1;
          return [{ used: state.used }];
        }),
        then: (resolve: (v: unknown) => unknown) => {
          state.used = Math.max(0, state.used - 1);
          return resolve(undefined);
        },
      }),
    }),
  });
  mockDb.query.userSettings.findFirst.mockImplementation(async () => ({
    freePostsUsed: state.used,
  }));
  return state;
}

describe("reserveFreePost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscriptionForUser.mockResolvedValue({ tier: "free" });
  });

  it("never hands out more reservations than the limit, even concurrently", async () => {
    const limit = 3;
    const state = mockCounter(0, limit);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveFreePost("user-1")),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(limit);
    expect(results.filter((r) => !r.allowed)).toHaveLength(10 - limit);
    expect(state.used).toBe(limit);
  });

  it("reports the plan limit in the denial", async () => {
    mockCounter(FREE_POST_LIMIT, FREE_POST_LIMIT);
    const denied = await reserveFreePost("user-1");
    expect(denied.allowed).toBe(false);
    if (denied.allowed) return;
    expect(denied.limit).toBe(FREE_POST_LIMIT);
    expect(denied.used).toBe(FREE_POST_LIMIT);
    expect(denied.reason).toMatch(/free posts/i);
  });

  it("does not consume anything for a paid tier", async () => {
    mockGetSubscriptionForUser.mockResolvedValue({ tier: "growth" });
    const reservation = await reserveFreePost("user-1");
    expect(reservation).toEqual({ allowed: true, consumed: false });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("gives a reservation back when the work it paid for failed", async () => {
    const state = mockCounter(0, 3);
    const reservation = await reserveFreePost("user-1");
    expect(state.used).toBe(1);

    await releaseFreePost(reservation, "user-1");
    expect(state.used).toBe(0);
  });

  it("releases nothing for a paid-tier reservation", async () => {
    mockCounter(0, 3);
    await releaseFreePost({ allowed: true, consumed: false }, "user-1");
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
