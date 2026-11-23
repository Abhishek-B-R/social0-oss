import { beforeEach, describe, expect, it, vi } from "vitest";

const CHANNEL_A = "UCaaaaaaaaaaaaaaaaaaaaaa";
const CHANNEL_B = "UCbbbbbbbbbbbbbbbbbbbbbb";

const { mockDb, mockDecrypt, cookieStore, twitterLogin } = vi.hoisted(() => ({
  mockDb: {
    query: {
      connectedAccounts: { findFirst: vi.fn() },
      verification: { findFirst: vi.fn() },
    },
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
  mockDecrypt: vi.fn(),
  cookieStore: { get: vi.fn(), delete: vi.fn() },
  twitterLogin: vi.fn(),
}));

class RouteRedirect extends Error {
  digest: string;
  constructor(readonly target: string) {
    super("ROUTE_REDIRECT");
    this.digest = `ROUTE_REDIRECT;${target}`;
  }
}

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/env.js", () => ({
  env: {
    YOUTUBE_CLIENT_ID: "yt-id",
    YOUTUBE_CLIENT_SECRET: "yt-secret",
    TWITTER_CONSUMER_KEY: "x-key",
    TWITTER_CONSUMER_SECRET: "x-secret",
  },
}));
vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  decrypt: mockDecrypt,
  encryptToken: (value: string, id: string) => `enc(${id}:${value})`,
  decryptToken: (value: string) => value,
  logConnectBlocked: vi.fn(),
}));
vi.mock("../lib/redirect.js", () => ({
  safeRedirect: (url: string) => {
    throw new RouteRedirect(url);
  },
  rethrowRouteRedirect: (err: unknown) => {
    if (err instanceof RouteRedirect) throw err;
  },
}));
vi.mock("../lib/oauth-callback-session.js", () => ({
  assertOAuthCallbackSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/app-url.js", () => ({
  getConnectCallbackBaseUrl: () => "https://api.test",
  connectionsSelectPath: (p: string) => `/${p}`,
}));
vi.mock("../lib/mirror-profile-image.js", () => ({
  mirrorProfileImageToR2: vi.fn().mockResolvedValue(null),
  resolveProfileImageUrl: (a: string | null, b: string | null) => a ?? b,
}));
vi.mock("../lib/youtube-token.js", () => ({
  isYouTubeAccessTokenUsable: vi.fn().mockResolvedValue(true),
  resolveEncryptedRefreshToken: (
    _id: string,
    existing: string | null,
    next: string | undefined,
  ) => next ?? existing,
  youtubeTokenExpiresAt: () => new Date(Date.now() + 3600_000),
}));
vi.mock("../lib/plan-limits.js", () => ({
  checkAccountLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../lib/billing-sync.js", () => ({
  syncSubscriptionForUserId: vi.fn(),
}));
vi.mock("../lib/http/request-cookies.js", () => ({
  cookies: async () => cookieStore,
}));
vi.mock("../lib/twitter-premium.js", () => ({
  refreshTwitterPremiumStatus: vi.fn(),
}));
vi.mock("twitter-api-v2", () => ({
  TwitterApi: class {
    login = twitterLogin;
  },
}));

import { platformCallback } from "../connect/platform-callback.js";
import {
  checkReauthIdentity,
  reauthIdentityAllowsUpdate,
} from "../lib/reauth-identity.js";
import { instagramMeIdentityIds } from "../lib/instagram-oauth.js";

function updateSpy() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn((_values: Record<string, unknown>) => ({ where }));
  mockDb.update.mockImplementation(() => ({ set }));
  return set;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function runCallback(platform: string, query: string) {
  try {
    await platformCallback(
      { url: `https://api.test/api/connect/${platform}/callback?${query}` } as never,
      { params: Promise.resolve({ platform }) },
    );
  } catch (err) {
    if (err instanceof RouteRedirect) return err.target;
    throw err;
  }
  throw new Error("callback returned without redirecting");
}

describe("checkReauthIdentity", () => {
  it("accepts the same identity", () => {
    expect(
      checkReauthIdentity({
        platform: "youtube",
        storedPlatformUserId: CHANNEL_A,
        returnedPlatformUserId: CHANNEL_A,
      }),
    ).toBe("same");
  });

  it("refuses a different identity", () => {
    const verdict = checkReauthIdentity({
      platform: "youtube",
      storedPlatformUserId: CHANNEL_A,
      returnedPlatformUserId: CHANNEL_B,
    });
    expect(verdict).toBe("different");
    expect(reauthIdentityAllowsUpdate(verdict)).toBe(false);
  });

  it("refuses when the provider lookup failed (placeholder id)", () => {
    const verdict = checkReauthIdentity({
      platform: "twitter_x",
      storedPlatformUserId: "12345",
      returnedPlatformUserId: "twitter_x-1700000000000",
    });
    expect(verdict).toBe("returned_unknown");
    expect(reauthIdentityAllowsUpdate(verdict)).toBe(false);
  });

  it("refuses a YouTube channel row reconnected with a channel-less Google account", () => {
    expect(
      checkReauthIdentity({
        platform: "youtube",
        storedPlatformUserId: CHANNEL_A,
        returnedPlatformUserId: "109876543210987654321",
      }),
    ).toBe("returned_unknown");
  });

  it("lets legacy rows (no comparable id) reconnect as before", () => {
    for (const [platform, stored] of [
      ["youtube", "109876543210987654321"],
      ["twitter_x", "twitter_x-1700000000000"],
      ["linkedin", "unknown-1700000000000"],
      ["tiktok", "someone"],
      ["threads", null],
    ] as const) {
      const verdict = checkReauthIdentity({
        platform,
        storedPlatformUserId: stored,
        returnedPlatformUserId: "real-id",
      });
      expect(verdict, `${platform}:${stored}`).toBe("stored_unknown");
      expect(reauthIdentityAllowsUpdate(verdict)).toBe(true);
    }
  });

  it("matches an Instagram row stored under the app-scoped id", () => {
    const me = { id: "app-scoped-9", user_id: "17841400000000001" };
    expect(instagramMeIdentityIds(me)).toEqual([
      "17841400000000001",
      "app-scoped-9",
    ]);
    expect(
      checkReauthIdentity({
        platform: "instagram",
        storedPlatformUserId: "app-scoped-9",
        returnedPlatformUserId: "17841400000000001",
        returnedAliasIds: instagramMeIdentityIds(me),
      }),
    ).toBe("same");
  });

  it("treats a LinkedIn company row reconnected by a personal profile as different", () => {
    expect(
      checkReauthIdentity({
        platform: "linkedin",
        storedPlatformUserId: "urn:li:organization:42",
        returnedPlatformUserId: "abcDEF123",
      }),
    ).toBe("different");
  });
});

describe("platformCallback reconnect identity", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  function youtubeProviderReturns(channelId: string) {
    mockDecrypt.mockReturnValue({
      userId: "user-1",
      workspaceId: null,
      platform: "youtube",
      reauth: true,
      reauthAccountId: "acct-a",
    });
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return jsonResponse({
          access_token: "tok-new",
          refresh_token: "refresh-new",
          expires_in: 3600,
        });
      }
      if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) {
        return jsonResponse({
          items: [{ id: channelId, snippet: { title: "Channel" } }],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    mockDb.query.connectedAccounts.findFirst.mockResolvedValue({
      id: "acct-a",
      userId: "user-1",
      platform: "youtube",
      platformUserId: CHANNEL_A,
      platformUsername: "Channel A",
      profileImageUrl: null,
      encryptedRefreshToken: "enc-old",
      platformMetadata: {},
    });
  }

  it("YouTube: picking a different Google account leaves the row untouched", async () => {
    youtubeProviderReturns(CHANNEL_B);
    const set = updateSpy();

    const target = await runCallback("youtube", "code=c&state=s");

    expect(target).toBe(
      "/dashboard/connections?error=reauth_account_mismatch&platform=youtube",
    );
    expect(set).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("YouTube: reconnecting the same channel still refreshes the row", async () => {
    youtubeProviderReturns(CHANNEL_A);
    const set = updateSpy();

    const target = await runCallback("youtube", "code=c&state=s");

    expect(target).toContain("reauth=success");
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toMatchObject({
      encryptedAccessToken: "enc(acct-a:tok-new)",
      platformUserId: CHANNEL_A,
    });
  });

  it("X OAuth 1.0a: a different X login leaves the row untouched", async () => {
    cookieStore.get.mockReturnValue({ value: "cookie" });
    mockDecrypt.mockReturnValue({
      oauth_token_secret: "req-secret",
      userId: "user-1",
      workspaceId: null,
      reauth: true,
      reauthAccountId: "acct-x",
    });
    twitterLogin.mockResolvedValue({
      accessToken: "x-tok",
      accessSecret: "x-sec",
    });
    fetchMock.mockResolvedValue(
      jsonResponse({ id_str: "2222", screen_name: "other" }),
    );
    mockDb.query.connectedAccounts.findFirst.mockResolvedValue({
      id: "acct-x",
      userId: "user-1",
      platform: "twitter_x",
      platformUserId: "1111",
      platformUsername: "mine",
      profileImageUrl: null,
    });
    const set = updateSpy();

    const target = await runCallback(
      "twitter_x",
      "oauth_token=t&oauth_verifier=v",
    );

    expect(target).toBe(
      "/dashboard/connections?error=reauth_account_mismatch&platform=twitter_x",
    );
    expect(set).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
