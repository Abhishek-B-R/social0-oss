/**
 * Live analytics / inbox reads resolve an account's tokens only on a cache
 * miss, and at most once per account per request.
 *
 * They used to call `resolveAccountAccess` for every publication before
 * `withPlatformReadCache`. For refreshable platforms that is a Redis lock and a
 * `connected_accounts` read, and for YouTube two Google tokeninfo calls (10s
 * timeout each). A YouTube overview of 24 fully cached videos made 48
 * serialized tokeninfo calls (YouTube concurrency is 1), ran out of the live
 * budget and reported cached publications as `skipped` / `partial`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockResolveAccountAccess,
  mockFetchMetrics,
  mockFetchComments,
  mockFetchDmMessages,
  cacheMode,
} = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockResolveAccountAccess: vi.fn(),
  mockFetchMetrics: vi.fn(),
  mockFetchComments: vi.fn(),
  mockFetchDmMessages: vi.fn(),
  /** "hit": every read is served from cache; "miss": every read fetches. */
  cacheMode: { value: "hit" as "hit" | "miss", hitData: null as unknown },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/workspace/session.js", () => ({
  requireWorkspaceSession: vi.fn(),
}));
vi.mock("../lib/resolve-scheduled-at.js", () => ({
  getUserTimezone: vi.fn(async () => "UTC"),
}));
vi.mock("../lib/connected-accounts.js", () => ({
  listActiveConnectedAccounts: vi.fn(async () => []),
}));
vi.mock("../lib/account-access.js", () => ({
  resolveAccountAccess: mockResolveAccountAccess,
}));
vi.mock("../lib/analytics/fetch-platform-metrics.js", () => ({
  BATCH_METRIC_PLATFORMS: new Set(["twitter_x", "bluesky", "youtube"]),
  fetchPlatformPublicationMetrics: mockFetchMetrics,
  // One batched call per account; each id still goes through the same mock so
  // the tests can count what reached the platform layer.
  fetchPlatformPublicationMetricsBatch: async (
    input: Record<string, unknown>,
    ids: string[],
  ) =>
    new Map(
      await Promise.all(
        ids.map(
          async (id) => [id, await mockFetchMetrics({ ...input, platformPostId: id })] as const,
        ),
      ),
    ),
}));
vi.mock("../lib/inbox/fetch-comments.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/inbox/fetch-comments.js")>()),
  fetchPublicationComments: mockFetchComments,
}));
vi.mock("../lib/inbox/fetch-dms.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/inbox/fetch-dms.js")>()),
  fetchDmMessages: mockFetchDmMessages,
}));
// The platform adapters pull in the publish media path; never reached here.
vi.mock("../lib/inbox/reply-comment.js", () => ({ replyOnPlatform: vi.fn() }));
vi.mock("../lib/inbox/reply-dm.js", () => ({ replyToDmOnPlatform: vi.fn() }));
vi.mock("../lib/live-platforms.js", () => {
  const live: Record<string, Record<string, boolean>> = {
    analytics: { youtube: true },
    inboxComments: { youtube: true },
    inboxDms: { bluesky: true },
  };
  return {
    LIVE_PLATFORMS: live,
    isPlatformLive: (feature: string, platform: string) =>
      live[feature]?.[platform] === true,
    livePlatformIds: (feature: string) =>
      Object.entries(live[feature] ?? {})
        .filter(([, on]) => on)
        .map(([id]) => id),
  };
});
vi.mock("../lib/platform-api-cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/platform-api-cache.js")>()),
  withPlatformReadCache: async (opts: { fetch: () => Promise<unknown> }) =>
    cacheMode.value === "hit"
      ? { data: cacheMode.hitData, fromCache: true, cachedAt: Date.now() }
      : { data: await opts.fetch(), fromCache: false },
  withPlatformBatchReadCache: async (opts: {
    suffixes: string[];
    fetchMany: (suffixes: string[]) => Promise<Map<string, unknown>>;
  }) => {
    if (cacheMode.value === "hit") {
      return new Map(
        opts.suffixes.map((s) => [
          s,
          { ok: true, read: { data: cacheMode.hitData, fromCache: true, cachedAt: Date.now() } },
        ]),
      );
    }
    const fetched = await opts.fetchMany(opts.suffixes);
    return new Map(
      [...fetched].map(([s, data]) => [s, { ok: true, read: { data, fromCache: false } }]),
    );
  },
}));

const { analyticsOverviewForScope } = await import("../services/analytics.js");
const { listInboxCommentsForScope, getInboxDmThreadForScope } = await import(
  "../services/inbox.js"
);

/** Drizzle-style builder: every chained call returns itself; awaiting yields `rows`. */
function chain(rows: unknown[]) {
  const self: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(rows);
        }
        return () => self;
      },
    },
  );
  return self;
}

const ctx = { resourceUserId: "user-1", workspaceId: null };
const ACCOUNT = {
  accountId: "yt-1",
  platform: "youtube",
  platformUserId: "UC123",
  platformUsername: "channel",
  profileImageUrl: null,
  scopes: "https://www.googleapis.com/auth/youtube.readonly",
  encryptedAccessToken: "enc",
  encryptedRefreshToken: "enc-refresh",
  platformAccountType: null,
};

function pubRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...ACCOUNT,
    publicationId: `pub-${i}`,
    postId: `post-${i}`,
    platformPostId: `video-${i}`,
    platformPostUrl: null,
    connectedAccountId: ACCOUNT.accountId,
    content: `post ${i}`,
    mediaIds: [],
    publishedAt: new Date(Date.now() - (i + 1) * 60 * 60 * 1000),
  }));
}

/** First select returns the publications; later ones (media, hides) are empty. */
function selectReturns(first: unknown[]) {
  mockDb.select.mockReturnValueOnce(chain(first)).mockReturnValue(chain([]));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReset();
  mockResolveAccountAccess.mockResolvedValue({
    accessToken: "token",
    accessSecret: null,
  });
  mockFetchMetrics.mockResolvedValue({ metrics: { views: 1 }, status: "ok" });
  mockFetchComments.mockResolvedValue({ comments: [], status: "ok" });
  mockFetchDmMessages.mockResolvedValue({ messages: [], status: "ok" });
});

describe("analytics overview token resolution", () => {
  it("does not resolve tokens when every publication is served from cache", async () => {
    cacheMode.value = "hit";
    cacheMode.hitData = { metrics: { views: 5 }, status: "ok" };
    // The all-accounts overview pages at 12 publications.
    selectReturns(pubRows(12));

    const out = await analyticsOverviewForScope(ctx, { range: "28d" });

    expect(out.publications).toHaveLength(12);
    expect(out.publications.every((p) => p.status === "ok")).toBe(true);
    expect(out.partial).toBe(false);
    expect(mockResolveAccountAccess).not.toHaveBeenCalled();
  });

  it("resolves an account's tokens once for many cache misses", async () => {
    cacheMode.value = "miss";
    selectReturns(pubRows(6));

    const out = await analyticsOverviewForScope(ctx, { range: "28d" });

    expect(mockFetchMetrics).toHaveBeenCalledTimes(6);
    expect(mockFetchMetrics.mock.calls[0][0]).toMatchObject({
      accessToken: "token",
    });
    expect(mockResolveAccountAccess).toHaveBeenCalledTimes(1);
    expect(out.publications.every((p) => p.status === "ok")).toBe(true);
  });

  it("reports a token failure on the publication, without retrying per post", async () => {
    cacheMode.value = "miss";
    selectReturns(pubRows(3));
    mockResolveAccountAccess.mockRejectedValue(
      new Error("Failed to refresh YouTube token. Please reconnect your account from Connections."),
    );

    const out = await analyticsOverviewForScope(ctx, { range: "28d" });

    expect(mockResolveAccountAccess).toHaveBeenCalledTimes(1);
    expect(mockFetchMetrics).not.toHaveBeenCalled();
    expect(out.publications.map((p) => p.status)).toEqual([
      "error",
      "error",
      "error",
    ]);
    expect(out.publications[0].error).toMatch(/Failed to refresh YouTube token/);
  });
});

describe("inbox comments token resolution", () => {
  it("does not resolve tokens for cached publications", async () => {
    cacheMode.value = "hit";
    cacheMode.hitData = { comments: [], status: "ok" };
    selectReturns(pubRows(4));

    await listInboxCommentsForScope(ctx, { platform: "youtube" });

    expect(mockResolveAccountAccess).not.toHaveBeenCalled();
  });

  it("resolves an account's tokens once for many cache misses", async () => {
    cacheMode.value = "miss";
    selectReturns(pubRows(4));

    await listInboxCommentsForScope(ctx, { platform: "youtube" });

    expect(mockFetchComments).toHaveBeenCalledTimes(4);
    expect(mockResolveAccountAccess).toHaveBeenCalledTimes(1);
  });
});

describe("inbox DM thread token resolution", () => {
  const dmAccount = {
    id: "bsky-1",
    platform: "bluesky",
    platformUserId: "did:plc:me",
    platformUsername: "me.bsky.social",
    profileImageUrl: null,
    scopes: null,
    encryptedAccessToken: "enc",
    encryptedRefreshToken: "enc-refresh",
  };

  it("does not resolve tokens for a cached thread", async () => {
    cacheMode.value = "hit";
    cacheMode.hitData = { messages: [], status: "ok" };
    selectReturns([dmAccount]);

    await getInboxDmThreadForScope(ctx, {
      accountId: dmAccount.id,
      conversationId: "convo-1",
    });

    expect(mockResolveAccountAccess).not.toHaveBeenCalled();
  });

  it("resolves tokens on a miss", async () => {
    cacheMode.value = "miss";
    selectReturns([dmAccount]);

    await getInboxDmThreadForScope(ctx, {
      accountId: dmAccount.id,
      conversationId: "convo-1",
    });

    expect(mockResolveAccountAccess).toHaveBeenCalledTimes(1);
    expect(mockFetchDmMessages).toHaveBeenCalledTimes(1);
  });
});
