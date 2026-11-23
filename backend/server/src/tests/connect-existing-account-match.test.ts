import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressions for the connect callbacks' "existing row" handling:
 * - Connecting a second TikTok account must add a row, not overwrite the
 *   first TikTok row (the lookup used to match ANY TikTok row).
 * - A reconnect must not flip `is_active` back on for an account the plan cap
 *   (syncConnectedAccountsToLimit) turned off.
 */

const OPEN_ID_A = "aaaaaaaa-1111-2222-3333-444444444444";
const OPEN_ID_B = "bbbbbbbb-1111-2222-3333-444444444444";
const CHANNEL_A = "UCaaaaaaaaaaaaaaaaaaaaaa";

const { mockDb, mockDecrypt, checkAccountLimits } = vi.hoisted(() => ({
  mockDb: {
    query: {
      connectedAccounts: { findFirst: vi.fn(), findMany: vi.fn() },
      verification: { findFirst: vi.fn() },
    },
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
  mockDecrypt: vi.fn(),
  checkAccountLimits: vi.fn(),
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
    TIKTOK_CLIENT_ID: "tt-id",
    TIKTOK_CLIENT_SECRET: "tt-secret",
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
vi.mock("../lib/plan-limits.js", () => ({ checkAccountLimits }));
vi.mock("../lib/billing-sync.js", () => ({
  syncSubscriptionForUserId: vi.fn(),
}));
vi.mock("../lib/http/request-cookies.js", () => ({
  cookies: async () => ({ get: vi.fn(), delete: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("../lib/twitter-premium.js", () => ({
  refreshTwitterPremiumStatus: vi.fn(),
}));
vi.mock("../lib/auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    },
  },
}));
vi.mock("../lib/session.js", () => ({
  getRouteSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));
vi.mock("../lib/workspace/session.js", () => ({
  requireWorkspacePermissionForUser: vi.fn().mockResolvedValue({
    ok: true,
    ctx: { resourceUserId: "user-1", workspaceId: null },
  }),
}));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  blueskyByokLimiter: {},
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { platformCallback } from "../connect/platform-callback.js";
import { blueskyByok } from "../connect/bluesky-byok.js";

const dialect = new PgDialect();

/**
 * A tiny connected_accounts table: a row matches when every bound value in
 * the query's WHERE equals one of its id / userId / platform / platformUserId.
 * Enough to tell "this open_id" apart from "any TikTok row".
 */
function useAccountsTable(rows: Record<string, unknown>[]) {
  const matches = (where: SQL | undefined) => {
    const params = where ? dialect.sqlToQuery(where).params : [];
    return rows.filter((row) =>
      params.every((p) =>
        [row.id, row.userId, row.platform, row.platformUserId].includes(p),
      ),
    );
  };
  mockDb.query.connectedAccounts.findFirst.mockImplementation(
    async ({ where }: { where?: SQL }) => matches(where)[0],
  );
  mockDb.query.connectedAccounts.findMany.mockImplementation(
    async ({ where }: { where?: SQL }) => matches(where),
  );
}

function writeSpies() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn((_values: Record<string, unknown>) => ({ where }));
  mockDb.update.mockImplementation(() => ({ set }));
  const values = vi.fn().mockResolvedValue(undefined);
  mockDb.insert.mockImplementation(() => ({ values }));
  mockDb.delete.mockImplementation(() => ({
    where: vi.fn().mockResolvedValue(undefined),
  }));
  return { set, values };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function runCallback(platform: string) {
  try {
    await platformCallback(
      {
        url: `https://api.test/api/connect/${platform}/callback?code=c&state=s`,
      } as never,
      { params: Promise.resolve({ platform }) },
    );
  } catch (err) {
    if (err instanceof RouteRedirect) return err.target;
    throw err;
  }
  throw new Error("callback returned without redirecting");
}

function tiktokRow(id: string, platformUserId: string) {
  return {
    id,
    userId: "user-1",
    workspaceId: null,
    platform: "tiktok",
    platformUserId,
    platformUsername: `name-${id}`,
    profileImageUrl: null,
    encryptedRefreshToken: "enc-old",
    platformMetadata: {},
    isActive: true,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  checkAccountLimits.mockResolvedValue({
    allowed: true,
    currentTotal: 1,
    limitTotal: 5,
    hasUsedTrial: false,
  });
});

describe("TikTok connect: existing-row match", () => {
  function tiktokProviderReturns(
    openId: string,
    reauthAccountId?: string,
    username?: string,
  ) {
    mockDecrypt.mockReturnValue({
      userId: "user-1",
      workspaceId: null,
      platform: "tiktok",
      stateId: "state-1",
      ...(reauthAccountId ? { reauth: true, reauthAccountId } : {}),
    });
    mockDb.query.verification.findFirst.mockResolvedValue({
      id: "state-1",
      value: "verifier",
      expiresAt: new Date(Date.now() + 60_000),
    });
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("https://open.tiktokapis.com/v2/oauth/token/")) {
        return jsonResponse({
          access_token: "tok-new",
          refresh_token: "refresh-new",
          expires_in: 86400,
          open_id: openId,
          scope: "user.info.basic,video.upload",
        });
      }
      if (url.startsWith("https://open.tiktokapis.com/v2/user/info/")) {
        return jsonResponse({
          data: {
            user: {
              open_id: openId,
              display_name: "New",
              ...(username ? { username } : {}),
            },
          },
          error: { code: "ok" },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  it("connecting account B next to account A inserts B and leaves A untouched", async () => {
    tiktokProviderReturns(OPEN_ID_B);
    // No row holds open_id B; the only TikTok row is account A.
    useAccountsTable([tiktokRow("acct-a", OPEN_ID_A)]);
    const { set, values } = writeSpies();

    const target = await runCallback("tiktok");

    expect(target).toContain("connected=tiktok");
    expect(set).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledTimes(1);
    expect(values.mock.calls[0][0]).toMatchObject({
      platform: "tiktok",
      platformUserId: OPEN_ID_B,
    });
    expect(values.mock.calls[0][0].id).not.toBe("acct-a");
  });

  it("reconnecting account A updates row A by open_id", async () => {
    tiktokProviderReturns(OPEN_ID_A);
    useAccountsTable([
      tiktokRow("acct-legacy", "someone"),
      tiktokRow("acct-a", OPEN_ID_A),
    ]);
    const { set, values } = writeSpies();

    await runCallback("tiktok");

    expect(values).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toMatchObject({
      encryptedAccessToken: "enc(acct-a:tok-new)",
      platformUserId: OPEN_ID_A,
    });
  });

  it("upgrades a single legacy row in place when its handle matches", async () => {
    tiktokProviderReturns(OPEN_ID_B, undefined, "legacy_handle");
    useAccountsTable([
      tiktokRow("acct-a", OPEN_ID_A),
      {
        ...tiktokRow("acct-legacy", "tiktok-1700000000000"),
        platformUsername: "@Legacy_Handle",
      },
    ]);
    const { set, values } = writeSpies();

    await runCallback("tiktok");

    expect(values).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toMatchObject({
      encryptedAccessToken: "enc(acct-legacy:tok-new)",
      platformUserId: OPEN_ID_B,
    });
  });

  it("upgrades a legacy row whose stored id is the returned handle", async () => {
    tiktokProviderReturns(OPEN_ID_B, undefined, "legacy_handle");
    useAccountsTable([tiktokRow("acct-legacy", "legacy_handle")]);
    const { set, values } = writeSpies();

    await runCallback("tiktok");

    expect(values).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toMatchObject({
      encryptedAccessToken: "enc(acct-legacy:tok-new)",
      platformUserId: OPEN_ID_B,
    });
  });

  it("connecting account B next to a single legacy row A inserts B and leaves A untouched", async () => {
    // Row A predates open_id storage; TikTok now returns a different account.
    tiktokProviderReturns(OPEN_ID_B, undefined, "account_b");
    useAccountsTable([tiktokRow("acct-legacy", "tiktok-1700000000000")]);
    const { set, values } = writeSpies();

    const target = await runCallback("tiktok");

    expect(target).toContain("connected=tiktok");
    expect(set).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledTimes(1);
    expect(values.mock.calls[0][0]).toMatchObject({
      platform: "tiktok",
      platformUserId: OPEN_ID_B,
    });
    expect(values.mock.calls[0][0].id).not.toBe("acct-legacy");
  });

  it("connecting with no returned username never adopts a legacy row", async () => {
    tiktokProviderReturns(OPEN_ID_B);
    // user.info fails, so the profile falls back to the token's open_id with
    // no username; an empty stored username must not count as a match.
    const providerFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).startsWith("https://open.tiktokapis.com/v2/user/info/")) {
        return jsonResponse({ error: { code: "access_token_invalid" } }, 401);
      }
      return providerFetch(input);
    });
    useAccountsTable([
      {
        ...tiktokRow("acct-legacy", "tiktok-1700000000000"),
        platformUsername: null,
      },
    ]);
    const { set, values } = writeSpies();

    await runCallback("tiktok");

    expect(set).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledTimes(1);
  });

  it("does not guess between several legacy rows", async () => {
    tiktokProviderReturns(OPEN_ID_B);
    useAccountsTable([
      tiktokRow("acct-l1", "someone"),
      tiktokRow("acct-l2", "someone-else"),
    ]);
    const { set, values } = writeSpies();

    await runCallback("tiktok");

    expect(set).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledTimes(1);
    expect(values.mock.calls[0][0]).toMatchObject({
      platformUserId: OPEN_ID_B,
    });
  });

  it("Reconnect on row A that comes back as account B is refused", async () => {
    tiktokProviderReturns(OPEN_ID_B, "acct-a");
    useAccountsTable([tiktokRow("acct-a", OPEN_ID_A)]);
    const { set, values } = writeSpies();

    const target = await runCallback("tiktok");

    expect(target).toBe(
      "/dashboard/connections?error=reauth_account_mismatch&platform=tiktok",
    );
    expect(set).not.toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
  });
});

describe("reconnect keeps the plan cap's is_active flag", () => {
  it("OAuth reconnect of an over-cap account does not reactivate it", async () => {
    mockDecrypt.mockReturnValue({
      userId: "user-1",
      workspaceId: null,
      platform: "youtube",
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
          items: [{ id: CHANNEL_A, snippet: { title: "Channel" } }],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    mockDb.query.connectedAccounts.findFirst.mockResolvedValue({
      id: "acct-yt",
      userId: "user-1",
      platform: "youtube",
      platformUserId: CHANNEL_A,
      platformUsername: "Channel A",
      profileImageUrl: null,
      encryptedRefreshToken: "enc-old",
      platformMetadata: {},
      isActive: false,
    });
    checkAccountLimits.mockResolvedValue({
      allowed: false,
      currentTotal: 3,
      limitTotal: 3,
      hasUsedTrial: true,
    });
    const { set, values } = writeSpies();

    await runCallback("youtube");

    expect(values).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toMatchObject({
      encryptedAccessToken: "enc(acct-yt:tok-new)",
    });
    expect(set.mock.calls[0][0]).not.toHaveProperty("isActive");
  });

  it("Bluesky BYOK reconnect of an over-cap account does not reactivate it", async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("https://bsky.social/xrpc/com.atproto.server.createSession")) {
        return jsonResponse({
          did: "did:plc:abc",
          handle: "alice.bsky.social",
          accessJwt: "jwt",
        });
      }
      return jsonResponse({}, 404);
    });
    mockDb.query.connectedAccounts.findFirst.mockResolvedValue({
      id: "acct-bsky",
      userId: "user-1",
      platform: "bluesky",
      platformUserId: "did:plc:abc",
      profileImageUrl: null,
      isActive: false,
    });
    checkAccountLimits.mockResolvedValue({
      allowed: false,
      currentTotal: 3,
      limitTotal: 3,
      hasUsedTrial: true,
    });
    const { set, values } = writeSpies();

    const res = await blueskyByok({
      json: async () => ({
        handle: "alice.bsky.social",
        appPassword: "xxxx-xxxx-xxxx-xxxx",
      }),
    } as never);

    expect(res.status).toBe(200);
    expect(values).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).not.toHaveProperty("isActive");
  });
});
