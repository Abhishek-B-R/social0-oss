/**
 * When the live request budget runs out mid-page, the paging cursor must not
 * jump past work that was never fetched.
 *
 * Comments: the cursor used to be the oldest publication on the page even when
 * the budget cut skipped it, so `lt(publishedAt, before)` on the next page left
 * every skipped publication on neither page.
 * DMs: accounts skipped by the budget were cut off by `untilForFetch = before`
 * on every later page.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockResolveAccountAccess,
  mockFetchComments,
  mockFetchAccountDms,
  budgetState,
} = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockResolveAccountAccess: vi.fn(),
  mockFetchComments: vi.fn(),
  mockFetchAccountDms: vi.fn(),
  /** Budget expires once this many platform reads have run. */
  budgetState: { reads: 0, expireAfter: Infinity },
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
vi.mock("../lib/inbox/fetch-comments.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/inbox/fetch-comments.js")>()),
  fetchPublicationComments: mockFetchComments,
}));
vi.mock("../lib/inbox/fetch-dms.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/inbox/fetch-dms.js")>()),
  fetchAccountDms: mockFetchAccountDms,
}));
vi.mock("../lib/inbox/reply-comment.js", () => ({ replyOnPlatform: vi.fn() }));
vi.mock("../lib/inbox/reply-dm.js", () => ({ replyToDmOnPlatform: vi.fn() }));
vi.mock("../lib/live-platforms.js", () => {
  const live: Record<string, Record<string, boolean>> = {
    analytics: {},
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
vi.mock("../lib/live-request-budget.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/live-request-budget.js")>()),
  createLiveRequestBudget: () => ({
    deadlineAt: 0,
    remainingMs: () => 0,
    isExpired: () => budgetState.reads >= budgetState.expireAfter,
  }),
}));
vi.mock("../lib/platform-api-cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/platform-api-cache.js")>()),
  withPlatformReadCache: async (opts: { fetch: () => Promise<unknown> }) => {
    const data = await opts.fetch();
    budgetState.reads++;
    return { data, fromCache: false };
  },
}));

const { listInboxCommentsForScope, listInboxDmsForScope } = await import(
  "../services/inbox.js"
);

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
const HOUR = 60 * 60 * 1000;
const NOW = Date.now();

function pubRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    publicationId: `pub-${i}`,
    postId: `post-${i}`,
    platformPostId: `video-${i}`,
    platformPostUrl: null,
    content: `post ${i}`,
    mediaIds: [],
    publishedAt: new Date(NOW - (i + 1) * HOUR),
    accountId: "yt-1",
    platform: "youtube",
    platformUserId: "UC1",
    platformUsername: "channel",
    profileImageUrl: null,
    scopes: null,
    encryptedAccessToken: "enc",
    encryptedRefreshToken: "enc-refresh",
  }));
}

function comment(pubIndex: number) {
  return {
    id: `c-${pubIndex}`,
    platform: "youtube",
    accountId: "yt-1",
    accountLabel: "channel",
    postId: `post-${pubIndex}`,
    publicationId: `pub-${pubIndex}`,
    postSnippet: "",
    authorName: "Fan",
    authorHandle: "fan",
    text: "nice",
    createdAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    parentId: null,
    likeCount: 0,
    likedByMe: false,
    isOwn: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReset();
  budgetState.reads = 0;
  budgetState.expireAfter = Infinity;
  mockResolveAccountAccess.mockResolvedValue({ accessToken: "t", accessSecret: null });
  mockFetchComments.mockImplementation(async (input: { publicationId: string }) => ({
    comments: [comment(Number(input.publicationId.split("-")[1]))],
    status: "ok",
  }));
});

describe("inbox comments cursor under a budget cut", () => {
  it("stops the cursor at the oldest publication actually fetched", async () => {
    // All-accounts pages hold 8 publications; the budget runs out after 3.
    const pubs = pubRows(8);
    mockDb.select.mockReturnValueOnce(chain(pubs)).mockReturnValue(chain([]));
    budgetState.expireAfter = 3;

    const out = await listInboxCommentsForScope(ctx, {});

    expect(mockFetchComments).toHaveBeenCalledTimes(3);
    expect(out.hasMore).toBe(true);
    // Next page is `publishedAt < pub-2`, so pub-3 .. pub-7 come next.
    expect(out.nextBefore).toBe(pubs[2]!.publishedAt.toISOString());
    expect(out.notices.some((n) => /request budget/i.test(n.message))).toBe(true);
  });

  it("keeps hasMore even when the cut page was short of the limit", async () => {
    const pubs = pubRows(5);
    mockDb.select.mockReturnValueOnce(chain(pubs)).mockReturnValue(chain([]));
    budgetState.expireAfter = 2;

    const out = await listInboxCommentsForScope(ctx, {});

    expect(out.hasMore).toBe(true);
    expect(out.nextBefore).toBe(pubs[1]!.publishedAt.toISOString());
  });

  it("pages past the whole page when nothing was skipped", async () => {
    const pubs = pubRows(8);
    mockDb.select.mockReturnValueOnce(chain(pubs)).mockReturnValue(chain([]));

    const out = await listInboxCommentsForScope(ctx, {});

    expect(mockFetchComments).toHaveBeenCalledTimes(8);
    expect(out.hasMore).toBe(true);
    expect(out.nextBefore).toBe(pubs[7]!.publishedAt.toISOString());
  });
});

describe("inbox DM cursor under a budget cut", () => {
  const accounts = ["a", "b", "c"].map((id) => ({
    id: `bsky-${id}`,
    platform: "bluesky",
    platformUserId: `did:plc:${id}`,
    platformUsername: `${id}.bsky.social`,
    profileImageUrl: null,
    scopes: null,
    platformMetadata: null,
    encryptedAccessToken: "enc",
    encryptedRefreshToken: "enc-refresh",
  }));

  function threadsFor(accountId: string, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      conversationId: `${accountId}-conv-${i}`,
      platform: "bluesky",
      accountId,
      accountLabel: accountId,
      peerId: `peer-${i}`,
      peerName: `Peer ${i}`,
      peerHandle: `peer${i}`,
      lastMessageAt: new Date(NOW - (i + 1) * 2 * HOUR).toISOString(),
      snippet: "hi",
      canReply: true,
    }));
  }

  beforeEach(() => {
    mockFetchAccountDms.mockImplementation(async (account: { id: string }) => ({
      threads: threadsFor(account.id, 10),
      status: "ok",
    }));
  });

  it("holds the cursor when accounts were skipped", async () => {
    mockDb.select.mockReturnValue(chain(accounts));
    budgetState.expireAfter = 1;
    const before = new Date(NOW - HOUR).toISOString();

    const out = await listInboxDmsForScope(ctx, { before, limit: 4 });

    expect(mockFetchAccountDms).toHaveBeenCalledTimes(1);
    expect(out.threads).toHaveLength(4);
    expect(out.hasMore).toBe(true);
    // Advancing to the 4th row would cut off accounts b and c for good.
    expect(out.nextBefore).toBe(before);
  });

  it("offers no cursor on a cut first page", async () => {
    mockDb.select.mockReturnValue(chain(accounts));
    budgetState.expireAfter = 1;

    const out = await listInboxDmsForScope(ctx, { limit: 4 });

    expect(out.hasMore).toBe(true);
    expect(out.nextBefore).toBeNull();
  });

  it("advances the cursor normally when every account was read", async () => {
    mockDb.select.mockReturnValue(chain(accounts));

    const out = await listInboxDmsForScope(ctx, { limit: 4 });

    expect(mockFetchAccountDms).toHaveBeenCalledTimes(3);
    expect(out.hasMore).toBe(true);
    expect(out.nextBefore).toBe(out.threads[3]!.lastMessageAt);
  });
});
