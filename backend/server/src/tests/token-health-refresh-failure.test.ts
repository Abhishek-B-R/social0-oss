import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily sweep proactively refreshes tokens inside the platform's refresh
 * horizon (14 days for Instagram). Any throw from that refresh — a provider
 * 5xx, a reset connection, a timeout — used to mark the account expired
 * without ever checking the token it already held, so a token with 10 days
 * left showed "Reconnect" everywhere after one bad minute at graph.instagram.com.
 */

const { mockDb, writes, rows } = vi.hoisted(() => ({
  writes: [] as { set: Record<string, unknown>; ids: string[] }[],
  rows: new Map<string, Record<string, unknown>>(),
  mockDb: {
    update: vi.fn(),
    query: { connectedAccounts: { findFirst: vi.fn() } },
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    inArray: (_col: unknown, ids: string[]) => ({ ids }),
    eq: (_col: unknown, id: string) => ({ ids: [id] }),
  };
});
vi.mock("@social0/shared/db/instance", () => ({ db: mockDb }));
// No Redis: the refresh lock fails open and refreshes directly.
vi.mock("@social0/shared/lib/redis", () => ({ redis: null }));

import { encryptToken } from "@social0/shared";
import { runTokenHealthCheck } from "@social0/shared/lib/token-health";

// Same clock the fixture's tokenExpiresAt uses. A fixed date here drifted
// from Date.now(): weeks later every "expires in 10 days" token sat outside
// the 14-day refresh horizon relative to it, and the refresh never ran.
const NOW = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

function account(
  id: string,
  platform: string,
  opts: { expiresInMs: number; refreshToken?: string },
) {
  const row = {
    id,
    platform,
    platformUserId: null,
    encryptedAccessToken: encryptToken(`token-${id}`, id),
    encryptedRefreshToken: opts.refreshToken
      ? encryptToken(opts.refreshToken, id)
      : null,
    // Refresh code compares against the real clock, health against `now`.
    tokenExpiresAt: new Date(Date.now() + opts.expiresInMs),
    lastSyncedAt: null,
    tokenStatus: "active",
    platformMetadata: null,
  };
  rows.set(id, row);
  return row;
}

const fetchMock = vi.fn();

function statusOf(id: string): "active" | "expired" | "untouched" {
  const hit = writes.find((w) => w.ids.includes(id));
  if (!hit) return "untouched";
  return hit.set.tokenStatus as "active" | "expired";
}

beforeEach(() => {
  writes.length = 0;
  rows.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockDb.query.connectedAccounts.findFirst.mockImplementation(
    async (q: { where: { ids: string[] } }) => rows.get(q.where.ids[0]),
  );
  mockDb.update.mockReturnValue({
    set: (set: Record<string, unknown>) => ({
      where: async (cond: { ids: string[] }) => {
        writes.push({ set, ids: cond.ids });
      },
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const IG_REFRESH = "https://graph.instagram.com/refresh_access_token";
const IG_VERIFY = "https://graph.instagram.com/me";

describe("runTokenHealthCheck when a proactive refresh fails", () => {
  it("keeps an account active when the refresh 500s but its token still works", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(IG_REFRESH)) return new Response("{}", { status: 500 });
      if (url.startsWith(IG_VERIFY)) return new Response("{}", { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    });

    await runTokenHealthCheck(
      [account("acc_ig", "instagram", { expiresInMs: 10 * DAY_MS })],
      { now: NOW, tryRefresh: true },
    );

    expect(statusOf("acc_ig")).toBe("active");
    expect(fetchMock.mock.calls.map(([u]) => String(u).split("?")[0])).toEqual([
      IG_REFRESH,
      IG_VERIFY,
    ]);
  });

  it("leaves the account as it is when both the refresh and the verify hit a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await runTokenHealthCheck(
      [account("acc_ig", "instagram", { expiresInMs: 10 * DAY_MS })],
      { now: NOW, tryRefresh: true },
    );

    expect(statusOf("acc_ig")).toBe("untouched");
  });

  it("still marks expired when the provider rejects the token and a forced refresh fails too", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(IG_REFRESH)) return new Response("{}", { status: 400 });
      if (url.startsWith(IG_VERIFY)) return new Response("{}", { status: 401 });
      throw new Error(`unexpected fetch ${url}`);
    });

    await runTokenHealthCheck(
      [account("acc_ig", "instagram", { expiresInMs: 10 * DAY_MS })],
      { now: NOW, tryRefresh: true },
    );

    expect(statusOf("acc_ig")).toBe("expired");
  });

  it("keeps a YouTube account when Google's token endpoint is down but the token is still usable", async () => {
    const prev = {
      id: process.env.YOUTUBE_CLIENT_ID,
      secret: process.env.YOUTUBE_CLIENT_SECRET,
    };
    process.env.YOUTUBE_CLIENT_ID = "yt-id";
    process.env.YOUTUBE_CLIENT_SECRET = "yt-secret";
    try {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === "https://oauth2.googleapis.com/token") {
          throw new TypeError("fetch failed");
        }
        if (url.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
          return Response.json({
            scope: "https://www.googleapis.com/auth/youtube.upload",
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      });

      await runTokenHealthCheck(
        [
          account("acc_yt", "youtube", {
            expiresInMs: 2 * 60 * 1000,
            refreshToken: "rt",
          }),
        ],
        { now: NOW, tryRefresh: true },
      );

      expect(statusOf("acc_yt")).toBe("active");
    } finally {
      process.env.YOUTUBE_CLIENT_ID = prev.id;
      process.env.YOUTUBE_CLIENT_SECRET = prev.secret;
      if (prev.id === undefined) delete process.env.YOUTUBE_CLIENT_ID;
      if (prev.secret === undefined) delete process.env.YOUTUBE_CLIENT_SECRET;
    }
  });

  it("does not read a YouTube tokeninfo outage as an expired token", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));

    await runTokenHealthCheck(
      [account("acc_yt", "youtube", { expiresInMs: 30 * DAY_MS })],
      { now: NOW, tryRefresh: false },
    );

    expect(statusOf("acc_yt")).toBe("untouched");
  });

  it("bounds every provider refresh call with a timeout signal", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(IG_REFRESH)) {
        return Response.json({ access_token: "new", expires_in: 5_184_000 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    await runTokenHealthCheck(
      [account("acc_ig", "instagram", { expiresInMs: 10 * DAY_MS })],
      { now: NOW, tryRefresh: true },
    );

    expect(statusOf("acc_ig")).toBe("active");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith(IG_REFRESH)).toBe(true);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
