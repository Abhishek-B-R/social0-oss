import { describe, expect, it, vi } from "vitest";

// Memory-only path: no Redis, outbound budgets always allow.
vi.mock("../lib/redis.js", () => ({ redis: null }));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  enforceRateLimit: async () => ({ allowed: true }),
}));

const { withPlatformReadCache, PlatformApiCooldownError } = await import(
  "../lib/platform-api-cache.js"
);

function rateLimited(): Error & { status: number } {
  return Object.assign(new Error("Too Many Requests"), { status: 429 });
}

describe("platform read cooldown scope", () => {
  it("a 429 on one read kind does not cool down other kinds for the same account", async () => {
    const accountId = "acct-cooldown-kinds";

    // Comment search (X Recent Search) is refused with nothing cached.
    await expect(
      withPlatformReadCache({
        platform: "twitter_x",
        accountId,
        kind: "inbox_comments",
        suffix: "pubs:1",
        fetch: async () => {
          throw rateLimited();
        },
      }),
    ).rejects.toBeInstanceOf(PlatformApiCooldownError);

    // DM thread, DM verify and analytics hit different endpoints: they must
    // still go to the platform.
    const dmFetch = vi.fn(async () => ({ thread: { peerName: "Ana", peerHandle: "ana" } }));
    const dm = await withPlatformReadCache({
      platform: "twitter_x",
      accountId,
      kind: "inbox_dm_thread",
      suffix: "verify:conv-1",
      fetch: dmFetch,
    });
    expect(dmFetch).toHaveBeenCalledTimes(1);
    expect(dm.fromCache).toBe(false);
    expect(dm.rateLimited).toBeUndefined();

    const analyticsFetch = vi.fn(async () => ({ impressions: 3 }));
    const analytics = await withPlatformReadCache({
      platform: "twitter_x",
      accountId,
      kind: "analytics",
      suffix: "overview",
      fetch: analyticsFetch,
    });
    expect(analyticsFetch).toHaveBeenCalledTimes(1);
    expect(analytics.fromCache).toBe(false);
  });

  it("still cools down the same read kind after a 429", async () => {
    const accountId = "acct-cooldown-same-kind";
    await expect(
      withPlatformReadCache({
        platform: "twitter_x",
        accountId,
        kind: "inbox_comments",
        suffix: "pubs:1",
        fetch: async () => {
          throw rateLimited();
        },
      }),
    ).rejects.toBeInstanceOf(PlatformApiCooldownError);

    const again = vi.fn(async () => ({}));
    await expect(
      withPlatformReadCache({
        platform: "twitter_x",
        accountId,
        kind: "inbox_comments",
        suffix: "pubs:2",
        fetch: again,
      }),
    ).rejects.toBeInstanceOf(PlatformApiCooldownError);
    expect(again).not.toHaveBeenCalled();
  });
});
