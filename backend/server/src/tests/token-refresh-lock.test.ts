import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: {
    store: new Map<string, string>(),
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("../lib/redis.js", () => ({ redis: mockRedis }));

import { withTokenRefreshLock } from "../lib/token-refresh-lock.js";

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
