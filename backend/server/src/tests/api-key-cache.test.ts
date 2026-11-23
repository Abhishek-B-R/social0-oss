/**
 * Every /v1 request used to read its API key row and write `last_used_at`.
 * Live keys are now cached for a short while, a revoke takes effect at once
 * through `forgetApiKeysForUser`, and `last_used_at` is written at most once a
 * minute per key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rows, selects, touches } = vi.hoisted(() => ({
  rows: new Map<string, { id: string; userId: string; keyHash: string; revokedAt: Date | null; expiresAt: Date | null }>(),
  selects: { n: 0 },
  touches: { n: 0 },
}));

vi.mock("../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selects.n += 1;
            return [...rows.values()];
          },
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          touches.n += 1;
          return Promise.resolve();
        },
      }),
    }),
  },
}));

import {
  API_KEY_CACHE_TTL_MS,
  forgetApiKeysForUser,
  hashApiKey,
  LAST_USED_WRITE_INTERVAL_MS,
  resolveApiKeyById,
  resolveRawApiKey,
} from "../lib/api-keys.js";

const RAW = "sk_live_cachedkey";

// Each test starts an hour after the last, so throttles from earlier tests
// have lapsed.
let start = Date.UTC(2026, 10, 1);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  start += 60 * 60 * 1000;
  vi.setSystemTime(start);
  rows.clear();
  rows.set("key-1", { id: "key-1", userId: "user_1", keyHash: hashApiKey(RAW), revokedAt: null, expiresAt: null });
  selects.n = 0;
  touches.n = 0;
  forgetApiKeysForUser("user_1");
});
afterEach(() => {
  vi.useRealTimers();
});

describe("API key cache", () => {
  it("answers repeat lookups without reading the row again", async () => {
    expect(await resolveRawApiKey(RAW)).toEqual({ userId: "user_1", apiKeyId: "key-1" });
    expect(await resolveRawApiKey(RAW)).toEqual({ userId: "user_1", apiKeyId: "key-1" });
    expect(await resolveApiKeyById("key-1")).toEqual({ userId: "user_1", apiKeyId: "key-1" });
    expect(selects.n).toBe(1);
  });

  it("sees a revoke at once when the revoking write forgets the user's keys", async () => {
    await resolveRawApiKey(RAW);
    rows.get("key-1")!.revokedAt = new Date();
    forgetApiKeysForUser("user_1");

    expect(await resolveRawApiKey(RAW)).toBeNull();
    expect(await resolveApiKeyById("key-1")).toBeNull();
  });

  it("rereads the row after the TTL even without an invalidation", async () => {
    await resolveRawApiKey(RAW);
    rows.get("key-1")!.revokedAt = new Date();
    vi.setSystemTime(Date.now() + API_KEY_CACHE_TTL_MS + 1);

    expect(await resolveRawApiKey(RAW)).toBeNull();
  });

  it("never caches a key that failed", async () => {
    rows.get("key-1")!.revokedAt = new Date();
    expect(await resolveRawApiKey(RAW)).toBeNull();
    rows.get("key-1")!.revokedAt = null;
    expect(await resolveRawApiKey(RAW)).not.toBeNull();
  });

  it("stops honouring a cached key once it expires", async () => {
    rows.get("key-1")!.expiresAt = new Date(Date.now() + 5_000);
    await resolveRawApiKey(RAW);
    vi.setSystemTime(Date.now() + 6_000);
    rows.get("key-1")!.revokedAt = new Date(); // whatever the row says, the expiry wins
    expect(await resolveRawApiKey(RAW)).toBeNull();
  });

  it("writes last_used_at at most once a minute per key", async () => {
    for (let i = 0; i < 20; i++) await resolveRawApiKey(RAW);
    expect(touches.n).toBe(1);

    vi.setSystemTime(Date.now() + LAST_USED_WRITE_INTERVAL_MS + 1);
    await resolveRawApiKey(RAW);
    expect(touches.n).toBe(2);
  });
});

describe("TtlCache", () => {
  it("evicts the oldest entry when full and expires entries by TTL", async () => {
    const { TtlCache } = await import("../lib/ttl-cache.js");
    let now = 0;
    const cache = new TtlCache<string, number>(1000, 2, () => now);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    now = 1001;
    expect(cache.get("c")).toBeUndefined();
    expect(cache.size).toBeLessThanOrEqual(2);
  });
});
