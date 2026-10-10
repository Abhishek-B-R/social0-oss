import { afterEach, describe, expect, it, vi } from "vitest";

// Exercise the in-process cache path deterministically (no Upstash).
vi.mock("../lib/redis.js", () => ({ redis: null }));

import {
  clampRetryAfter,
  DEFAULT_PLATFORM_RETRY_AFTER_SEC,
  isGraphRateLimitBody,
  isYouTubeQuotaBody,
  MAX_PLATFORM_RETRY_AFTER_SEC,
  PlatformRateLimitError,
  retryAfterFromHeaders,
  throwIfPlatformRateLimited,
} from "../lib/platform-rate-limit.js";
import {
  accountReadBudget,
  isPlatformRateLimitError,
  PlatformApiCooldownError,
  platformCooldownMessage,
  retryAfterSeconds,
  withPlatformBatchReadCache,
  withPlatformReadCache,
} from "../lib/platform-api-cache.js";
import { fetchPlatformPublicationMetricsBatch } from "../lib/analytics/fetch-platform-metrics.js";
import { verifiedPeerFromThread } from "../lib/inbox/verify-dm.js";
import { dmThreadCacheSuffix } from "../lib/inbox/page-param.js";

let accountSeq = 0;
/** Fresh account id per test so in-memory cache and cooldowns never leak. */
const nextAccount = () => `acct-${Date.now()}-${accountSeq++}`;

describe("platform 429 detection", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");

  it("reads Retry-After as delta seconds or an HTTP date", () => {
    expect(retryAfterFromHeaders(new Headers({ "retry-after": "30" }), now)).toBe(30);
    expect(
      retryAfterFromHeaders(
        new Headers({ "retry-after": new Date(now + 90_000).toUTCString() }),
        now,
      ),
    ).toBe(90);
  });

  it("reads X / Bluesky reset headers as epoch or delta", () => {
    const epoch = String(Math.floor(now / 1000) + 120);
    expect(retryAfterFromHeaders({ "x-rate-limit-reset": epoch }, now)).toBe(120);
    expect(retryAfterFromHeaders({ "ratelimit-reset": "45" }, now)).toBe(45);
    expect(retryAfterFromHeaders(undefined, now)).toBeNull();
  });

  it("clamps cooldowns to a sane window", () => {
    expect(clampRetryAfter(null)).toBe(DEFAULT_PLATFORM_RETRY_AFTER_SEC);
    expect(clampRetryAfter(-5)).toBe(DEFAULT_PLATFORM_RETRY_AFTER_SEC);
    expect(clampRetryAfter(10_000)).toBe(MAX_PLATFORM_RETRY_AFTER_SEC);
    expect(clampRetryAfter(1.2)).toBe(2);
  });

  it("recognises Meta and YouTube throttling bodies", () => {
    expect(isGraphRateLimitBody({ error: { code: 17 } })).toBe(true);
    expect(isGraphRateLimitBody({ error: { code: 80002 } })).toBe(true);
    expect(isGraphRateLimitBody({ error: { code: 10 } })).toBe(false);
    expect(
      isYouTubeQuotaBody({ error: { errors: [{ reason: "quotaExceeded" }] } }),
    ).toBe(true);
    expect(
      isYouTubeQuotaBody({ error: { errors: [{ reason: "insufficientPermissions" }] } }),
    ).toBe(false);
  });

  it("throws only for throttled responses", () => {
    expect(() => throwIfPlatformRateLimited("bluesky", { status: 200 })).not.toThrow();
    expect(() => throwIfPlatformRateLimited("bluesky", { status: 403 })).not.toThrow();
    expect(() => throwIfPlatformRateLimited("bluesky", { status: 429 })).toThrow(
      PlatformRateLimitError,
    );
    expect(() =>
      throwIfPlatformRateLimited(
        "instagram",
        { status: 400, data: { error: { code: 4 } } },
        { graph: true },
      ),
    ).toThrow(PlatformRateLimitError);
  });

  it("prefers the platform's own reset hint for the cooldown", () => {
    const nowMs = Date.now();
    expect(retryAfterSeconds(new PlatformRateLimitError("bluesky", 33))).toBe(33);
    expect(
      retryAfterSeconds({ code: 429, rateLimit: { reset: Math.floor(nowMs / 1000) + 61 } }, nowMs),
    ).toBeGreaterThanOrEqual(60);
    expect(isPlatformRateLimitError(new PlatformRateLimitError("x"))).toBe(true);
  });
});

describe("read budgets", () => {
  it("lets a user open a burst of X conversations without self-throttling", () => {
    // The old 2-per-minute budget refused the third conversation click.
    const budget = accountReadBudget("twitter_x", "inbox_dm_thread");
    expect(budget.tokens).toBeGreaterThanOrEqual(10);
    expect(budget.window).toBe("15 m");
  });

  it("explains cooldowns in user terms", () => {
    const now = 1_000_000;
    expect(platformCooldownMessage("twitter_x", now + 40_000, now)).toBe(
      "X is limiting requests right now. Try again in about 40s.",
    );
    expect(platformCooldownMessage("bluesky", now + 125_000, now)).toContain("3 min");
  });
});

describe("withPlatformReadCache cooldown", () => {
  it("cools down after a platform 429 and stops calling the platform", async () => {
    const accountId = nextAccount();
    const fetch = vi.fn(async () => {
      throw new PlatformRateLimitError("bluesky", 60);
    });
    const read = () =>
      withPlatformReadCache({
        platform: "bluesky",
        accountId,
        kind: "inbox_dm_thread",
        suffix: "convo",
        fetch,
      });
    await expect(read()).rejects.toBeInstanceOf(PlatformApiCooldownError);
    await expect(read()).rejects.toBeInstanceOf(PlatformApiCooldownError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("scopes the cooldown to the throttled read kind", async () => {
    const accountId = nextAccount();
    await expect(
      withPlatformReadCache({
        platform: "bluesky",
        accountId,
        kind: "inbox_dm_thread",
        suffix: "convo",
        fetch: async () => {
          throw new PlatformRateLimitError("bluesky", 60);
        },
      }),
    ).rejects.toBeInstanceOf(PlatformApiCooldownError);
    const analytics = await withPlatformReadCache({
      platform: "bluesky",
      accountId,
      kind: "analytics",
      suffix: "post",
      fetch: async () => ({ status: "ok", metrics: { likes: 1 } }),
    });
    expect(analytics.fromCache).toBe(false);
  });
});

describe("withPlatformBatchReadCache", () => {
  it("fetches only cache misses, in one call, and caches each item", async () => {
    const accountId = nextAccount();
    const fetchMany = vi.fn(async (suffixes: string[]) =>
      new Map(suffixes.map((s) => [s, { status: "ok", metrics: { likes: s.length } }])),
    );
    const first = await withPlatformBatchReadCache({
      platform: "twitter_x",
      accountId,
      kind: "analytics",
      suffixes: ["1", "22", "1"],
      fetchMany,
    });
    expect(fetchMany).toHaveBeenCalledTimes(1);
    expect(fetchMany).toHaveBeenLastCalledWith(["1", "22"]);
    expect([...first.keys()]).toEqual(["1", "22"]);

    const second = await withPlatformBatchReadCache({
      platform: "twitter_x",
      accountId,
      kind: "analytics",
      suffixes: ["1", "22", "333"],
      fetchMany,
    });
    expect(fetchMany).toHaveBeenCalledTimes(2);
    expect(fetchMany).toHaveBeenLastCalledWith(["333"]);
    const cached = second.get("1");
    expect(cached?.ok && cached.read.fromCache).toBe(true);
  });

  it("reports every miss as cooled down when the platform throttles the batch", async () => {
    const accountId = nextAccount();
    const fetchMany = vi.fn(async () => {
      throw new PlatformRateLimitError("twitter_x", 120);
    });
    const res = await withPlatformBatchReadCache({
      platform: "twitter_x",
      accountId,
      kind: "analytics",
      suffixes: ["a", "b"],
      fetchMany,
    });
    for (const item of res.values()) {
      expect(item.ok).toBe(false);
      if (!item.ok) expect(item.error.retryAfterSec()).toBeGreaterThan(100);
    }
    await withPlatformBatchReadCache({
      platform: "twitter_x",
      accountId,
      kind: "analytics",
      suffixes: ["a"],
      fetchMany,
    });
    expect(fetchMany).toHaveBeenCalledTimes(1);
  });
});

describe("batched metrics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("looks up many YouTube videos in one request", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [
            { id: "v1", statistics: { viewCount: "10", likeCount: "2", commentCount: "1" } },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchPlatformPublicationMetricsBatch(
      { platform: "youtube", platformUserId: "ch", accessToken: "t" },
      ["v1", "v2"],
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("id")).toBe("v1,v2");
    expect(out.get("v1")).toMatchObject({ status: "ok", metrics: { views: 10, likes: 2 } });
    expect(out.get("v2")?.status).toBe("error");
  });

  it("raises YouTube quota exhaustion as throttling, not a missing scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: { message: "quota", errors: [{ reason: "quotaExceeded" }] },
          }),
          { status: 403 },
        ),
      ),
    );
    await expect(
      fetchPlatformPublicationMetricsBatch(
        { platform: "youtube", platformUserId: "ch", accessToken: "t" },
        ["v1"],
      ),
    ).rejects.toBeInstanceOf(PlatformRateLimitError);
  });
});

describe("DM thread helpers", () => {
  it("keeps the newest page on the bare conversation key", () => {
    expect(dmThreadCacheSuffix("c1", null)).toBe("c1");
    const a = dmThreadCacheSuffix("c1", "cursor-a");
    expect(a).not.toBe("c1");
    expect(a).not.toBe(dmThreadCacheSuffix("c1", "cursor-b"));
    expect(a.startsWith("c1:c:")).toBe(true);
  });

  it("only trusts a thread read that returned messages and a peer", () => {
    expect(
      verifiedPeerFromThread({ status: "ok", messages: [{}], thread: { peerId: "p1" } }),
    ).toBe("p1");
    expect(
      verifiedPeerFromThread({ status: "ok", messages: [], thread: { peerId: "p1" } }),
    ).toBeNull();
    expect(
      verifiedPeerFromThread({ status: "error", messages: [{}], thread: { peerId: "p1" } }),
    ).toBeNull();
    expect(
      verifiedPeerFromThread({ status: "ok", messages: [{}], thread: { peerId: " " } }),
    ).toBeNull();
  });
});
