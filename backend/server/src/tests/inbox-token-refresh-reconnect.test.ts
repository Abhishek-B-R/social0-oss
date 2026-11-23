/**
 * A refresh token the provider no longer accepts is a reconnect, not a
 * generic fetch error.
 *
 * `getValidToken` throws plain Errors ("Failed to refresh YouTube token.
 * Please reconnect ...", "TikTok refresh failed. Please reconnect ...") with
 * no status code. The inbox catches only added a reconnect hint when the DB
 * scopes column happened to be short, so a revoked Google grant showed a red
 * error on every row and never the reconnect badge / banner / CLI hint.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPlatformAuthError,
  TOKEN_EXPIRED_MARKER,
} from "../lib/platform-auth-errors.js";

const { mockDb, mockResolveAccountAccess } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockResolveAccountAccess: vi.fn(),
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
vi.mock("../lib/inbox/reply-comment.js", () => ({ replyOnPlatform: vi.fn() }));
vi.mock("../lib/inbox/reply-dm.js", () => ({ replyToDmOnPlatform: vi.fn() }));
vi.mock("../lib/live-platforms.js", () => {
  const live: Record<string, Record<string, boolean>> = {
    analytics: {},
    inboxComments: { youtube: true },
    inboxDms: { tiktok: true },
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
// Every read is a cache miss, so the token step always runs.
vi.mock("../lib/platform-api-cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/platform-api-cache.js")>()),
  withPlatformReadCache: async (opts: { fetch: () => Promise<unknown> }) => ({
    data: await opts.fetch(),
    fromCache: false,
  }),
}));

const {
  getInboxDmThreadForScope,
  listInboxCommentsForScope,
  listInboxDmsForScope,
} = await import("../services/inbox.js");

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
const YT_REFRESH_FAILED =
  "Failed to refresh YouTube token. Please reconnect your account from Connections.";

const ytPub = {
  publicationId: "pub-1",
  postId: "post-1",
  platformPostId: "video-1",
  platformPostUrl: null,
  content: "hello",
  mediaIds: [],
  publishedAt: new Date(Date.now() - 60 * 60 * 1000),
  accountId: "yt-1",
  platform: "youtube",
  platformUserId: "UC1",
  platformUsername: "channel",
  profileImageUrl: null,
  // Full scopes on file: the DB gives no reason to suggest a reconnect.
  scopes:
    "https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload",
  encryptedAccessToken: "enc",
  encryptedRefreshToken: "enc-refresh",
};

const tiktokAccount = {
  id: "tt-1",
  platform: "tiktok",
  platformUserId: "tt-user",
  platformUsername: "creator",
  profileImageUrl: null,
  scopes: null,
  platformMetadata: null,
  encryptedAccessToken: "enc",
  encryptedRefreshToken: "enc-refresh",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReset();
});

describe("isPlatformAuthError: failed token refresh", () => {
  it.each([
    "Failed to refresh YouTube token. Please reconnect your account from Connections.",
    "Failed to refresh Instagram token. Please reconnect your account.",
    "TikTok refresh failed. Please reconnect your account.",
    "No refresh token available. Please reconnect your account.",
    "No refresh token available. Please reconnect your YouTube account from Connections.",
  ])("treats %j as a dead token", (message) => {
    expect(isPlatformAuthError(new Error(message))).toBe(true);
  });

  it("leaves server-side problems alone", () => {
    expect(isPlatformAuthError(new Error("YouTube OAuth credentials not configured"))).toBe(false);
    expect(isPlatformAuthError(new Error("Account not found"))).toBe(false);
    expect(isPlatformAuthError(new Error("Comment fetch timed out after 10000ms"))).toBe(false);
  });
});

describe("inbox reads with a dead refresh token", () => {
  it("comments: flags the account for reconnect with the token-expired marker", async () => {
    mockDb.select.mockReturnValueOnce(chain([ytPub])).mockReturnValue(chain([]));
    mockResolveAccountAccess.mockRejectedValue(new Error(YT_REFRESH_FAILED));

    const out = await listInboxCommentsForScope(ctx, { platform: "youtube" });

    expect(out.accountsNeedingReconnect).toEqual([
      {
        accountId: "yt-1",
        platform: "youtube",
        username: "channel",
        missingScopes: [TOKEN_EXPIRED_MARKER],
      },
    ]);
    expect(out.fetchErrors).toHaveLength(1);
    expect(out.fetchErrors[0]!.error).toMatch(/YouTube session expired or was revoked/);
  });

  it("comments: a transient failure stays a plain fetch error", async () => {
    mockDb.select.mockReturnValueOnce(chain([ytPub])).mockReturnValue(chain([]));
    mockResolveAccountAccess.mockRejectedValue(new Error("socket hang up"));

    const out = await listInboxCommentsForScope(ctx, { platform: "youtube" });

    expect(out.accountsNeedingReconnect).toEqual([]);
    expect(out.fetchErrors[0]!.error).toBe("socket hang up");
  });

  it("DM list: flags the account for reconnect", async () => {
    mockDb.select.mockReturnValue(chain([tiktokAccount]));
    mockResolveAccountAccess.mockRejectedValue(
      new Error("TikTok refresh failed. Please reconnect your account."),
    );

    const out = await listInboxDmsForScope(ctx, {});

    expect(out.accountsNeedingReconnect).toEqual([
      expect.objectContaining({
        accountId: "tt-1",
        missingScopes: [TOKEN_EXPIRED_MARKER],
      }),
    ]);
    expect(out.fetchErrors[0]!.error).toMatch(/TikTok session expired or was revoked/);
  });

  it("DM thread: says the session expired instead of the raw refresh error", async () => {
    mockDb.select.mockReturnValue(chain([tiktokAccount]));
    mockResolveAccountAccess.mockRejectedValue(
      new Error("No refresh token available. Please reconnect your account."),
    );

    const out = await getInboxDmThreadForScope(ctx, {
      accountId: "tt-1",
      conversationId: "conv-1",
    });

    expect(out).toEqual({
      error: "TikTok session expired or was revoked - reconnect the account.",
      code: "fetch_failed",
    });
  });
});
