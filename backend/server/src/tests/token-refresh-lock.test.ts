import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedis, mockFindFirst, mockGetValidYouTubeToken } = vi.hoisted(() => ({
  mockRedis: {
    store: new Map<string, string>(),
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
  mockFindFirst: vi.fn(),
  mockGetValidYouTubeToken: vi.fn(),
}));

// These modules live in @social0/shared so the background worker runs the same
// token pipeline; mock the paths they are actually imported from.
vi.mock("@social0/shared/lib/redis", () => ({ redis: mockRedis }));
vi.mock("@social0/shared/db/instance", () => ({
  db: { query: { connectedAccounts: { findFirst: mockFindFirst } } },
}));
vi.mock("@social0/shared/lib/youtube-token", () => ({
  getValidYouTubeToken: mockGetValidYouTubeToken,
}));

import { encryptToken } from "@social0/shared";
import { withTokenRefreshLock } from "../lib/token-refresh-lock.js";
import { getValidToken } from "../lib/token-refresh.js";

function wireRedis() {
  mockRedis.store.clear();
  mockRedis.set.mockImplementation(
    async (key: string, value: string, opts?: { nx?: boolean }) => {
      if (opts?.nx && mockRedis.store.has(key)) return null;
      mockRedis.store.set(key, value);
      return "OK";
    },
  );
  mockRedis.get.mockImplementation(
    async (key: string) => mockRedis.store.get(key) ?? null,
  );
  mockRedis.del.mockImplementation(async (key: string) => {
    mockRedis.store.delete(key);
    return 1;
  });
}

describe("withTokenRefreshLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireRedis();
  });

  /**
   * Publishing fans out several platform jobs on one account. Before the lock,
   * each of them called the provider's refresh endpoint; on TikTok / Pinterest /
   * LinkedIn the refresh token rotates, so the loser presented an invalidated
   * token and the account dropped out with "please reconnect".
   */
  it("lets only one concurrent caller run the refresh", async () => {
    let running = 0;
    let maxConcurrent = 0;
    let refreshes = 0;

    const refresh = async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      refreshes += 1;
      await new Promise((r) => setTimeout(r, 30));
      running -= 1;
      return "new-token";
    };

    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () =>
        withTokenRefreshLock("acc-1", refresh),
      ),
    );

    expect(maxConcurrent).toBe(1);
    expect(refreshes).toBe(1);
    expect(outcomes.filter((o) => o.refreshed)).toHaveLength(1);
    // The losers are told to re-read rather than refresh again.
    expect(outcomes.filter((o) => !o.refreshed)).toHaveLength(3);
  });

  it("releases the lock even when the refresh throws", async () => {
    await expect(
      withTokenRefreshLock("acc-2", async () => {
        throw new Error("provider rejected the refresh");
      }),
    ).rejects.toThrow("provider rejected");

    const second = await withTokenRefreshLock("acc-2", async () => "ok");
    expect(second).toEqual({ refreshed: true, value: "ok" });
  });

  it("does not release a lock another caller now holds", async () => {
    // Simulate our TTL expiring mid-refresh: someone else takes the key.
    const outcome = await withTokenRefreshLock("acc-3", async () => {
      mockRedis.store.set("token-refresh:lock:acc-3", "someone-else");
      return "value";
    });

    expect(outcome).toEqual({ refreshed: true, value: "value" });
    expect(mockRedis.store.get("token-refresh:lock:acc-3")).toBe("someone-else");
  });

  it("refreshes without a lock when Redis is unavailable", async () => {
    mockRedis.set.mockRejectedValue(new Error("redis down"));
    mockRedis.get.mockRejectedValue(new Error("redis down"));

    const outcome = await withTokenRefreshLock("acc-4", async () => "fallback");
    expect(outcome).toEqual({ refreshed: true, value: "fallback" });
  });
});

describe("getValidToken behind the refresh lock", () => {
  const accountId = "acc-yt";

  beforeEach(() => {
    vi.clearAllMocks();
    wireRedis();
    mockFindFirst.mockResolvedValue({
      id: accountId,
      platform: "youtube",
      encryptedAccessToken: encryptToken("stored-token", accountId),
    });
    mockGetValidYouTubeToken.mockResolvedValue("refreshed-token");
  });

  /** Every `getValidToken` takes the lock, even one that only reads the token. */
  function holdLockBriefly() {
    const key = `token-refresh:lock:${accountId}`;
    mockRedis.store.set(key, "another-caller");
    setTimeout(() => mockRedis.store.delete(key), 50);
  }

  /**
   * YouTube retries an upload that got a 401 with a forced refresh, and token
   * health does the same before marking an account expired. Waiting out a lock
   * held by a caller that only read the token used to hand back that same
   * rejected token: the retry failed again and a dead account read as active.
   */
  it("still refreshes when the refresh was forced", async () => {
    holdLockBriefly();

    const token = await getValidToken(accountId, "youtube", {
      forceRefresh: true,
    });

    expect(token).toBe("refreshed-token");
    expect(mockGetValidYouTubeToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: accountId }),
      { forceRefresh: true },
    );
  });

  it("reads the stored token when the refresh was not forced", async () => {
    holdLockBriefly();

    const token = await getValidToken(accountId, "youtube");

    expect(token).toBe("stored-token");
    expect(mockGetValidYouTubeToken).not.toHaveBeenCalled();
  });
});
