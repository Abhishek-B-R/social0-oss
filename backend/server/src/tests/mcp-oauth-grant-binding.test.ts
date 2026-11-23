import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MCP OAuth tokens act through the user's connector API key (by row id). When
 * that key is replaced, a token may "heal" onto the current one. These tests pin down who
 * may heal: only a grant from the client the user approved last, approved
 * after the user's last dashboard revoke, and never by minting a key Postgres
 * says the user revoked.
 */

type KeyRow = {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

const { kv, keys, mockRedis, mockDb, counter } = vi.hoisted(() => {
  const kv = new Map<string, unknown>();
  const keys: KeyRow[] = [];
  const counter = { n: 0 };
  const mockRedis = {
    get: vi.fn(async (k: string) => (kv.has(k) ? kv.get(k) : null)),
    set: vi.fn(async (k: string, v: unknown) => {
      kv.set(k, v);
      return "OK";
    }),
    del: vi.fn(async (k: string) => (kv.delete(k) ? 1 : 0)),
    getdel: vi.fn(async (k: string) => {
      const v = kv.has(k) ? kv.get(k) : null;
      kv.delete(k);
      return v;
    }),
    expire: vi.fn(async (k: string) => (kv.has(k) ? 1 : 0)),
  };
  // Only the connector-key queries in mcp-oauth.ts hit the db, for one user.
  const mockDb = {
    update: vi.fn(() => ({
      set: (patch: { revokedAt: Date }) => ({
        where: async () => {
          for (const row of keys) {
            if (!row.revokedAt) row.revokedAt = patch.revokedAt;
          }
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: (row: { userId: string; name: string; keyHash: string }) => {
        counter.n += 1;
        const id = `key-${counter.n}`;
        keys.push({
          ...row,
          id,
          revokedAt: null,
          expiresAt: null,
          createdAt: new Date(Date.now() + counter.n),
        });
        return { returning: async () => [{ id }] };
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () =>
              [...keys]
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                .slice(0, 1),
          }),
        }),
      }),
    })),
  };
  return { kv, keys, mockRedis, mockDb, counter };
});

vi.mock("../lib/redis.js", () => ({ redis: mockRedis }));
vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/api-keys.js", () => ({
  forgetApiKeysForUser: () => undefined,
  generateApiKey: () => {
    counter.n += 1;
    const raw = `sk_live_test${counter.n}`;
    return { raw, hash: raw, prefix: raw.slice(0, 12) };
  },
  isApiKeyFormat: (raw: string) => raw.startsWith("sk_live_"),
  resolveRawApiKey: async (raw: string) => {
    const row = keys.find((k) => k.keyHash === raw);
    if (!row || row.revokedAt) return null;
    return { userId: row.userId, apiKeyId: row.id };
  },
  resolveApiKeyById: async (id: string) => {
    const row = keys.find((k) => k.id === id);
    if (!row || row.revokedAt) return null;
    return { userId: row.userId, apiKeyId: row.id };
  },
}));

const {
  approveMcpOAuthSession,
  createMcpOAuthSession,
  exchangeMcpAuthorizationCode,
  introspectMcpAccessToken,
  markMcpConnectorRevoked,
  mintMcpConsentToken,
  refreshMcpAccessToken,
  registerMcpOAuthClient,
  resolveMcpAccessTokenAuth,
  revokeMcpToken,
  boundMcpResource,
  ACCESS_TOKEN_TTL_SECONDS,
} = await import("../lib/mcp-oauth.js");

const USER = "user_1";
const VERIFIER = "verifier-verifier-verifier-verifier-verifier-1234";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

let clock = Date.UTC(2026, 0, 1);
function tick() {
  clock += 1_000;
  vi.setSystemTime(clock);
}

async function registerClient(name: string) {
  return registerMcpOAuthClient({
    redirect_uris: [`https://${name}.example/cb`],
    client_name: name,
    token_endpoint_auth_method: "none",
  });
}

async function connect(client: { client_id: string; redirect_uris: string[] }) {
  tick();
  const redirectUri = client.redirect_uris[0]!;
  const sessionId = await createMcpOAuthSession({
    clientId: client.client_id,
    redirectUri,
    codeChallenge: CHALLENGE,
  });
  const consent = await mintMcpConsentToken(sessionId, USER);
  const { redirectUrl } = await approveMcpOAuthSession(sessionId, USER, consent!);
  const code = new URL(redirectUrl).searchParams.get("code")!;
  return exchangeMcpAuthorizationCode({
    code,
    clientId: client.client_id,
    redirectUri,
    codeVerifier: VERIFIER,
  });
}

/** What DELETE /api/api-keys/:id does for the connector key. */
async function revokeFromDashboard() {
  tick();
  await markMcpConnectorRevoked(USER);
  for (const row of keys) row.revokedAt ??= new Date();
}

describe("MCP OAuth connector key healing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clock);
    kv.clear();
    keys.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not give a disconnected host the key of the host approved after it", async () => {
    const a = await registerClient("dubious");
    const b = await registerClient("claude");
    const tokensA = await connect(a);
    await revokeFromDashboard();
    const tokensB = await connect(b);

    const introA = await introspectMcpAccessToken(tokensA.access_token);
    expect(introA).toEqual({ active: false });

    await expect(
      refreshMcpAccessToken({ refreshToken: tokensA.refresh_token, clientId: a.client_id }),
    ).rejects.toThrow("invalid_grant");

    const introB = await introspectMcpAccessToken(tokensB.access_token);
    expect(introB.active).toBe(true);
    expect(introB.client_id).toBe(b.client_id);
  });

  it("approving another host cuts the previous one off without any revoke", async () => {
    const a = await registerClient("chatgpt");
    const b = await registerClient("cursor");
    const tokensA = await connect(a);
    const tokensB = await connect(b);

    expect(await introspectMcpAccessToken(tokensA.access_token)).toEqual({ active: false });
    expect((await introspectMcpAccessToken(tokensB.access_token)).active).toBe(true);
  });

  it("still heals an older token of the same host onto its re-approved key", async () => {
    const a = await registerClient("claude");
    const first = await connect(a);
    const second = await connect(a);

    const healed = await resolveMcpAccessTokenAuth(first.access_token);
    const current = await resolveMcpAccessTokenAuth(second.access_token);
    expect(healed).not.toBeNull();
    expect(healed!.apiKeyId).toBe(current!.apiKeyId);
  });

  it("keeps grants from before a revoke dead after the same host is approved again", async () => {
    const a = await registerClient("claude");
    const before = await connect(a);
    await revokeFromDashboard();
    const after = await connect(a);

    expect(await introspectMcpAccessToken(before.access_token)).toEqual({ active: false });
    expect((await introspectMcpAccessToken(after.access_token)).active).toBe(true);
  });

  it("never mints a key for a token whose connector Postgres says was revoked", async () => {
    const a = await registerClient("claude");
    const tokens = await connect(a);
    // Dashboard revoke whose Redis marker never landed: only Postgres knows.
    for (const row of keys) row.revokedAt = new Date();
    mockDb.insert.mockClear();

    expect(await introspectMcpAccessToken(tokens.access_token)).toEqual({ active: false });
    await expect(
      refreshMcpAccessToken({ refreshToken: tokens.refresh_token, clientId: a.client_id }),
    ).rejects.toThrow("invalid_grant");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("heals onto the current key by id, without minting a key or keeping a raw one", async () => {
    const a = await registerClient("claude");
    const first = await connect(a);
    await connect(a);
    mockDb.insert.mockClear();

    const healed = await resolveMcpAccessTokenAuth(first.access_token);
    expect(healed?.apiKeyId).toBe(keys.find((k) => !k.revokedAt)!.id);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(kv.has(`mcp:oauth:connector-raw:${USER}`)).toBe(false);
  });

  it("honours a revoke marker written as an ISO string by older builds", async () => {
    const a = await registerClient("claude");
    const before = await connect(a);
    tick();
    kv.set(`mcp:oauth:connector-revoked:${USER}`, new Date(clock).toISOString());
    for (const row of keys) row.revokedAt = new Date();
    await connect(a);

    expect(await introspectMcpAccessToken(before.access_token)).toEqual({ active: false });
  });

  it("reports a revoke marker Redis did not take instead of swallowing it", async () => {
    mockRedis.set.mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(markMcpConnectorRevoked(USER)).rejects.toThrow(/revocation/);
  });
});

describe("MCP OAuth granted scope", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clock);
    kv.clear();
    keys.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("issues tokens with the scope the client asked for, through a refresh", async () => {
    const a = await registerClient("claude");
    tick();
    const redirectUri = a.redirect_uris[0]!;
    const sessionId = await createMcpOAuthSession({
      clientId: a.client_id,
      redirectUri,
      codeChallenge: CHALLENGE,
      scope: "posts:read analytics:read",
    });
    const consent = await mintMcpConsentToken(sessionId, USER);
    const { redirectUrl } = await approveMcpOAuthSession(sessionId, USER, consent!);
    const tokens = await exchangeMcpAuthorizationCode({
      code: new URL(redirectUrl).searchParams.get("code")!,
      clientId: a.client_id,
      redirectUri,
      codeVerifier: VERIFIER,
    });

    expect(tokens.scope).toBe("posts:read analytics:read");
    expect((await resolveMcpAccessTokenAuth(tokens.access_token))?.scope).toBe(
      "posts:read analytics:read",
    );
    const refreshed = await refreshMcpAccessToken({
      refreshToken: tokens.refresh_token,
      clientId: a.client_id,
    });
    expect(refreshed.scope).toBe("posts:read analytics:read");
  });
});

/**
 * RFC 8707: the `resource` a client names is checked against what this server
 * serves, bound to the grant, and checked again at the token endpoint. Before,
 * it was stored on the session and never looked at.
 */
describe("MCP OAuth resource binding", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clock);
    kv.clear();
    keys.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function approve(resource?: string) {
    const a = await registerClient("claude");
    tick();
    const redirectUri = a.redirect_uris[0]!;
    const sessionId = await createMcpOAuthSession({
      clientId: a.client_id,
      redirectUri,
      codeChallenge: CHALLENGE,
      ...(resource ? { resource } : {}),
    });
    const consent = await mintMcpConsentToken(sessionId, USER);
    const { redirectUrl } = await approveMcpOAuthSession(sessionId, USER, consent!);
    return { a, redirectUri, code: new URL(redirectUrl).searchParams.get("code")! };
  }

  it("binds to the MCP resource whether named by path, origin, or not at all", () => {
    expect(boundMcpResource(undefined)).toBe("https://mcp.social0.app/mcp");
    expect(boundMcpResource("https://mcp.social0.app/mcp")).toBe("https://mcp.social0.app/mcp");
    expect(boundMcpResource("https://MCP.social0.app/mcp/")).toBe("https://mcp.social0.app/mcp");
    expect(boundMcpResource("https://mcp.social0.app")).toBe("https://mcp.social0.app/mcp");
  });

  it("refuses any other audience", () => {
    expect(boundMcpResource("https://evil.example/mcp")).toBeNull();
    expect(boundMcpResource("https://mcp.social0.app/other")).toBeNull();
    expect(boundMcpResource("https://mcp.social0.app/mcp?x=1")).toBeNull();
    expect(boundMcpResource("not a url")).toBeNull();
  });

  it("records the resource on the token", async () => {
    const { a, redirectUri, code } = await approve("https://mcp.social0.app/mcp");
    const tokens = await exchangeMcpAuthorizationCode({
      code,
      clientId: a.client_id,
      redirectUri,
      codeVerifier: VERIFIER,
      resource: "https://mcp.social0.app/mcp",
    });
    expect((await resolveMcpAccessTokenAuth(tokens.access_token))?.resource).toBe(
      "https://mcp.social0.app/mcp",
    );
  });

  it("refuses a token request for a resource the grant was not bound to", async () => {
    const { a, redirectUri, code } = await approve();
    await expect(
      exchangeMcpAuthorizationCode({
        code,
        clientId: a.client_id,
        redirectUri,
        codeVerifier: VERIFIER,
        resource: "https://evil.example/api",
      }),
    ).rejects.toThrow("invalid_target");
  });

  it("refuses a refresh for another resource and spends the refresh token", async () => {
    const { a, redirectUri, code } = await approve();
    const tokens = await exchangeMcpAuthorizationCode({
      code,
      clientId: a.client_id,
      redirectUri,
      codeVerifier: VERIFIER,
    });
    await expect(
      refreshMcpAccessToken({
        refreshToken: tokens.refresh_token,
        clientId: a.client_id,
        resource: "https://evil.example/api",
      }),
    ).rejects.toThrow("invalid_target");
    await expect(
      refreshMcpAccessToken({ refreshToken: tokens.refresh_token, clientId: a.client_id }),
    ).rejects.toThrow("invalid_grant");
  });

  it("refuses to approve a session for another resource", async () => {
    await expect(approve("https://evil.example/api")).rejects.toThrow(/resource/);
  });
});

describe("MCP OAuth access token lifetime", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clock);
    kv.clear();
    keys.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("issues one-hour access tokens that stop working after that", async () => {
    const a = await registerClient("claude");
    const tokens = await connect(a);
    expect(tokens.expires_in).toBe(3600);
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(3600);

    clock += 3601 * 1000;
    vi.setSystemTime(clock);
    expect(await resolveMcpAccessTokenAuth(tokens.access_token)).toBeNull();

    // The refresh token still renews the grant.
    const refreshed = await refreshMcpAccessToken({
      refreshToken: tokens.refresh_token,
      clientId: a.client_id,
    });
    expect((await resolveMcpAccessTokenAuth(refreshed.access_token))?.userId).toBe(USER);
  });
});

describe("MCP refresh token rotation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clock);
    kv.clear();
    keys.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("redeems one refresh token once, even under concurrent requests", async () => {
    const a = await registerClient("claude");
    const tokens = await connect(a);

    const results = await Promise.allSettled([
      refreshMcpAccessToken({ refreshToken: tokens.refresh_token, clientId: a.client_id }),
      refreshMcpAccessToken({ refreshToken: tokens.refresh_token, clientId: a.client_id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as Error).message).toBe("invalid_grant");
  });

  it("carries the grant time through a refresh", async () => {
    const a = await registerClient("claude");
    const tokens = await connect(a);
    tick();
    const refreshed = await refreshMcpAccessToken({
      refreshToken: tokens.refresh_token,
      clientId: a.client_id,
    });
    await revokeFromDashboard();
    await connect(a);

    // Refreshed after approval but granted before the revoke: still dead.
    expect(await introspectMcpAccessToken(refreshed.access_token)).toEqual({ active: false });
  });
});

/**
 * Postgres keeps only API key hashes; Redis used to undo that by storing the
 * raw connector key in every token record (and under its own key), and the raw
 * access, refresh and code values in key names. Now everything is keyed by a
 * hash and points at the connector key by id.
 */
describe("MCP OAuth records hold no raw secrets", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clock);
    kv.clear();
    keys.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function everythingInRedis(): string {
    return JSON.stringify([...kv.entries()]);
  }

  it("stores no raw API key, access token or refresh token anywhere in Redis", async () => {
    const a = await registerClient("claude");
    const tokens = await connect(a);
    const refreshed = await refreshMcpAccessToken({
      refreshToken: tokens.refresh_token,
      clientId: a.client_id,
    });

    const dump = everythingInRedis();
    for (const secret of [
      ...keys.map((k) => k.keyHash), // the mock's raw key equals its hash
      tokens.access_token,
      tokens.refresh_token,
      refreshed.access_token,
      refreshed.refresh_token,
    ]) {
      expect(dump).not.toContain(secret);
    }
    expect(dump).not.toContain("apiKeyRaw");
    expect((await resolveMcpAccessTokenAuth(refreshed.access_token))?.userId).toBe(USER);
  });

  it("never returns a credential from introspection", async () => {
    const a = await registerClient("claude");
    const tokens = await connect(a);

    const intro = await introspectMcpAccessToken(tokens.access_token);

    expect(intro.active).toBe(true);
    expect(Object.keys(intro).sort()).toEqual(["active", "client_id", "client_name", "exp", "scope"]);
  });

  it("migrates a token stored by an older build and drops its raw key", async () => {
    const a = await registerClient("claude");
    await connect(a);
    const liveKey = keys.find((k) => !k.revokedAt)!;
    const legacyAccess = "legacy-access-token";
    kv.set(`mcp:oauth:token:${legacyAccess}`, {
      userId: USER,
      apiKeyRaw: liveKey.keyHash,
      clientId: a.client_id,
      scope: "social0:read",
      expiresAt: Math.floor(clock / 1000) + 3600,
      grantedAt: clock,
    });

    const auth = await resolveMcpAccessTokenAuth(legacyAccess);

    expect(auth?.apiKeyId).toBe(liveKey.id);
    expect(kv.has(`mcp:oauth:token:${legacyAccess}`)).toBe(false);
    expect(everythingInRedis()).not.toContain(legacyAccess);
    expect(everythingInRedis()).not.toContain("apiKeyRaw");
  });

  it("redeems a refresh token stored by an older build and kills its access token", async () => {
    const a = await registerClient("claude");
    await connect(a);
    const liveKey = keys.find((k) => !k.revokedAt)!;
    kv.set("mcp:oauth:token:old-access", {
      userId: USER,
      apiKeyRaw: liveKey.keyHash,
      clientId: a.client_id,
      scope: "social0:read",
      expiresAt: Math.floor(clock / 1000) + 3600,
      grantedAt: clock,
    });
    kv.set("mcp:oauth:refresh:old-refresh", {
      userId: USER,
      apiKeyRaw: liveKey.keyHash,
      clientId: a.client_id,
      scope: "social0:read",
      accessToken: "old-access",
      grantedAt: clock,
    });

    const next = await refreshMcpAccessToken({ refreshToken: "old-refresh", clientId: a.client_id });

    expect(await resolveMcpAccessTokenAuth("old-access")).toBeNull();
    expect((await resolveMcpAccessTokenAuth(next.access_token))?.apiKeyId).toBe(liveKey.id);
    expect(everythingInRedis()).not.toContain("old-refresh");
  });

  it("revokes by hash, and a revoked refresh token takes its access token with it", async () => {
    const a = await registerClient("claude");
    const tokens = await connect(a);

    await revokeMcpToken({ token: tokens.refresh_token, clientId: a.client_id, tokenTypeHint: "refresh_token" });

    expect(await resolveMcpAccessTokenAuth(tokens.access_token)).toBeNull();
    await expect(
      refreshMcpAccessToken({ refreshToken: tokens.refresh_token, clientId: a.client_id }),
    ).rejects.toThrow("invalid_grant");
  });
});
