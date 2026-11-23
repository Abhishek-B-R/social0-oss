/**
 * POST /oauth/register is unauthenticated and writes to the shared Redis. It
 * used to store client_name, grant_types, response_types and
 * token_endpoint_auth_method verbatim for a year, so a loop of 1 MB names
 * could fill the Redis that BullMQ, rate limits and auth depend on. These tests
 * pin the bounds: validated, normalized metadata only, a 64 KB body cap, a
 * per-caller registration budget under an app-wide ceiling (see
 * mcp-oauth-caller-limits.test.ts), and a client TTL that only outlives its
 * grants when the client actually uses them.
 */

import { createHash } from "node:crypto";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { kv, ttls, mockRedis, enforceRateLimit } = vi.hoisted(() => {
  const kv = new Map<string, unknown>();
  const ttls = new Map<string, number>();
  const mockRedis = {
    get: vi.fn(async (k: string) => (kv.has(k) ? kv.get(k) : null)),
    set: vi.fn(async (k: string, v: unknown, opts?: { ex?: number }) => {
      kv.set(k, v);
      if (opts?.ex) ttls.set(k, opts.ex);
      return "OK";
    }),
    del: vi.fn(async (k: string) => (kv.delete(k) ? 1 : 0)),
    getdel: vi.fn(async (k: string) => {
      const v = kv.has(k) ? kv.get(k) : null;
      kv.delete(k);
      return v;
    }),
    expire: vi.fn(async (k: string, seconds: number) => {
      if (!kv.has(k)) return 0;
      ttls.set(k, seconds);
      return 1;
    }),
  };
  return { kv, ttls, mockRedis, enforceRateLimit: vi.fn() };
});

vi.mock("../lib/redis.js", () => ({ redis: mockRedis }));
vi.mock("../db/index.js", () => ({
  db: {
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({ values: () => ({ returning: async () => [{ id: "key-1" }] }) }),
  },
}));
vi.mock("../lib/api-keys.js", () => ({
  forgetApiKeysForUser: () => undefined,
  generateApiKey: () => ({ raw: "sk_live_test1", hash: "h", prefix: "sk_live_test" }),
  isApiKeyFormat: (raw: string) => raw.startsWith("sk_live_"),
  resolveRawApiKey: async (raw: string) =>
    raw === "sk_live_test1" ? { userId: "user_1", apiKeyId: "key-1" } : null,
  resolveApiKeyById: async (id: string) =>
    id === "key-1" ? { userId: "user_1", apiKeyId: "key-1" } : null,
}));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}), enforceRateLimit }));
vi.mock("../lib/env.js", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://social0.app" },
  getAuthApiBaseUrl: () => "https://api.social0.app",
}));
vi.mock("../middleware/auth.js", () => ({
  requireSessionUserId: async () => "user_1",
}));

const {
  MCP_CLIENT_NAME_MAX_LENGTH,
  McpClientMetadataError,
  approveMcpOAuthSession,
  createMcpOAuthSession,
  exchangeMcpAuthorizationCode,
  getMcpOAuthSessionDetails,
  mintMcpConsentToken,
  normalizeMcpClientRegistration,
  refreshMcpAccessToken,
  registerMcpOAuthClient,
} = await import("../lib/mcp-oauth.js");
const { registerMcpOAuthRoutes } = await import("../routes/oauth/mcp.js");

const DAY = 60 * 60 * 24;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

async function buildApp() {
  const app = Fastify();
  await app.register(registerMcpOAuthRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  kv.clear();
  ttls.clear();
  vi.clearAllMocks();
  enforceRateLimit.mockResolvedValue({ allowed: true });
});

describe("normalizeMcpClientRegistration", () => {
  it("caps client_name and keeps only the fields the server uses", () => {
    const metadata = normalizeMcpClientRegistration({
      redirect_uris: [REDIRECT],
      client_name: `  ${"A".repeat(1_000_000)}  `,
      grant_types: ["authorization_code", "refresh_token", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      logo_uri: "https://evil.example/" + "x".repeat(100_000),
      junk: { nested: ["y".repeat(100_000)] },
    });
    expect(metadata).toEqual({
      redirect_uris: [REDIRECT],
      client_name: "A".repeat(MCP_CLIENT_NAME_MAX_LENGTH),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it("drops a blank client_name instead of storing whitespace", () => {
    expect(
      normalizeMcpClientRegistration({ redirect_uris: [REDIRECT], client_name: "   " }),
    ).toEqual({ redirect_uris: [REDIRECT] });
  });

  it.each([
    ["a non-object body", null],
    ["a string body", "redirect_uris=x"],
    ["missing redirect_uris", { client_name: "x" }],
    ["too many redirect_uris", { redirect_uris: Array(11).fill(REDIRECT) }],
    ["an overlong redirect_uri", { redirect_uris: [`https://a.example/${"x".repeat(2048)}`] }],
    ["a non-https redirect_uri", { redirect_uris: ["http://evil.example/cb"] }],
    ["a non-string client_name", { redirect_uris: [REDIRECT], client_name: ["A".repeat(10)] }],
    ["an unknown grant type", { redirect_uris: [REDIRECT], grant_types: ["client_credentials"] }],
    ["a non-array grant_types", { redirect_uris: [REDIRECT], grant_types: "authorization_code" }],
    ["an empty grant_types", { redirect_uris: [REDIRECT], grant_types: [] }],
    ["oversized grant_types", { redirect_uris: [REDIRECT], grant_types: ["z".repeat(100_000)] }],
    ["an unknown response type", { redirect_uris: [REDIRECT], response_types: ["token"] }],
    [
      "an unsupported auth method",
      { redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" },
    ],
    [
      "a non-string auth method",
      { redirect_uris: [REDIRECT], token_endpoint_auth_method: { a: 1 } },
    ],
  ])("rejects %s as invalid metadata", (_label, body) => {
    expect(() => normalizeMcpClientRegistration(body)).toThrow(McpClientMetadataError);
  });
});

describe("MCP client record in Redis", () => {
  it("stores only normalized metadata, with a 30-day TTL", async () => {
    const client = await registerMcpOAuthClient({
      redirect_uris: [REDIRECT],
      client_name: "B".repeat(500_000),
      extra: "z".repeat(100_000),
    });
    const stored = kv.get(`mcp:oauth:client:${client.client_id}`) as Record<string, unknown>;
    expect(stored.client_name).toBe("B".repeat(MCP_CLIENT_NAME_MAX_LENGTH));
    expect(stored).not.toHaveProperty("extra");
    expect(stored.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(stored.response_types).toEqual(["code"]);
    expect(stored.token_endpoint_auth_method).toBe("client_secret_post");
    expect(typeof stored.client_secret).toBe("string");
    expect(ttls.get(`mcp:oauth:client:${client.client_id}`)).toBe(30 * DAY);
  });

  it("keeps a client alive as long as the grants it holds", async () => {
    const client = await registerMcpOAuthClient({
      redirect_uris: [REDIRECT],
      client_name: "Claude",
      token_endpoint_auth_method: "none",
    });
    const key = `mcp:oauth:client:${client.client_id}`;
    const verifier = "verifier-verifier-verifier-verifier-verifier-1234";
    const sessionId = await createMcpOAuthSession({
      clientId: client.client_id,
      redirectUri: REDIRECT,
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
    });
    const consent = await mintMcpConsentToken(sessionId, "user_1");
    const { redirectUrl } = await approveMcpOAuthSession(sessionId, "user_1", consent!);
    const code = new URL(redirectUrl).searchParams.get("code")!;

    ttls.set(key, 1);
    const tokens = await exchangeMcpAuthorizationCode({
      code,
      clientId: client.client_id,
      redirectUri: REDIRECT,
      codeVerifier: verifier,
    });
    const refreshTtl = ttls.get(
      `mcp:oauth:refresh:h:${createHash("sha256").update(tokens.refresh_token).digest("hex")}`,
    );
    expect(refreshTtl).toBe(90 * DAY);
    expect(ttls.get(key)).toBe(refreshTtl);

    ttls.set(key, 1);
    await refreshMcpAccessToken({ refreshToken: tokens.refresh_token, clientId: client.client_id });
    expect(ttls.get(key)).toBe(refreshTtl);
  });

  it("shows a legacy oversized client_name trimmed on the consent page", async () => {
    kv.set("mcp:oauth:client:mcp_legacy", {
      client_id: "mcp_legacy",
      redirect_uris: [REDIRECT],
      client_name: "C".repeat(1_000_000),
      client_id_issued_at: 0,
    });
    const sessionId = await createMcpOAuthSession({
      clientId: "mcp_legacy",
      redirectUri: REDIRECT,
      codeChallenge: "x",
    });
    const details = await getMcpOAuthSessionDetails(sessionId);
    expect(details?.clientName).toBe("C".repeat(MCP_CLIENT_NAME_MAX_LENGTH));
  });
});

describe("POST /oauth/register", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("registers a well-formed client", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: {
        redirect_uris: [REDIRECT],
        client_name: "Claude",
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.client_name).toBe("Claude");
    expect(body.client_secret).toBeUndefined();
    // The caller's own bucket, then the app-wide ceiling.
    expect(enforceRateLimit.mock.calls.map((call) => call[1])).toEqual([
      "ip:127.0.0.1",
      "global",
    ]);
  });

  it("refuses a body over 64 KB before touching Redis", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: { redirect_uris: [REDIRECT], client_name: "A".repeat(1_000_000) },
    });
    expect(res.statusCode).toBe(413);
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("answers invalid_client_metadata for unsupported metadata without spending budget", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: { redirect_uris: [REDIRECT], token_endpoint_auth_method: "private_key_jwt" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_client_metadata");
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("answers invalid_client_metadata for a non-object body instead of crashing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      headers: { "content-type": "application/json" },
      payload: "null",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_client_metadata");
  });

  it("stops a caller that spent its own budget without touching the ceiling", async () => {
    enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      status: 429,
      error: "Too many requests. Try again later.",
      reset: Date.now() + 30_000,
    });
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: { redirect_uris: [REDIRECT], client_name: "Claude" },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("temporarily_unavailable");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(enforceRateLimit.mock.calls.map((call) => call[1])).toEqual(["ip:127.0.0.1"]);
  });

  it("stops registering once the app-wide ceiling is spent", async () => {
    enforceRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({
        allowed: false,
        status: 429,
        error: "Too many requests. Try again later.",
      });
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: { redirect_uris: [REDIRECT], client_name: "Claude" },
    });
    expect(res.statusCode).toBe(429);
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(enforceRateLimit.mock.calls[1]?.[1]).toBe("global");
  });
});
