/**
 * The unauthenticated MCP OAuth routes write to the shared Redis on every call.
 *
 * - /oauth/register used to share one 30-per-minute bucket across the whole
 *   app, so one machine sending valid metadata every 2 s locked every real host
 *   (Claude, ChatGPT, Cursor) out of connecting. It is now budgeted per caller
 *   address, which the mcp-worker forwards signed, under a high app-wide ceiling.
 * - /oauth/authorize stored unbounded state/scope/resource/code_challenge values
 *   for 15 minutes with no limit at all. They are now bounded before any Redis
 *   call, and the route is budgeted per caller and per client.
 */

import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { kv, mockRedis, enforceRateLimit } = vi.hoisted(() => {
  const kv = new Map<string, unknown>();
  const mockRedis = {
    get: vi.fn(async (k: string) => (kv.has(k) ? kv.get(k) : null)),
    set: vi.fn(async (k: string, v: unknown) => {
      kv.set(k, v);
      return "OK";
    }),
    del: vi.fn(async (k: string) => (kv.delete(k) ? 1 : 0)),
    expire: vi.fn(async () => 1),
  };
  return { kv, mockRedis, enforceRateLimit: vi.fn() };
});

vi.mock("../lib/redis.js", () => ({ redis: mockRedis }));
vi.mock("../db/index.js", () => ({ db: {} }));
vi.mock("../lib/api-keys.js", () => ({
  forgetApiKeysForUser: () => undefined,
  generateApiKey: () => ({ raw: "sk_live_test1", hash: "h", prefix: "sk_live_test" }),
  isApiKeyFormat: () => false,
  resolveRawApiKey: async () => null,
}));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}), enforceRateLimit }));
vi.mock("../lib/env.js", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://social0.app" },
  getAuthApiBaseUrl: () => "https://api.social0.app",
}));
vi.mock("../middleware/auth.js", () => ({ requireSessionUserId: async () => null }));

const lib = await import("../lib/mcp-oauth.js");
const { registerMcpOAuthRoutes } = await import("../routes/oauth/mcp.js");

type WorkerAuth = {
  signClientIp(ip: string, secret: string): Promise<string>;
  proxyOAuthRequest(
    request: Request,
    env: { API_BASE_URL: string; MCP_OAUTH_INTROSPECT_SECRET: string },
    path: string,
  ): Promise<Response>;
};
// The worker is its own package; load its source directly so a drift between
// its signing and the API's verification fails here.
const workerAuthUrl = new URL(
  "../../../../cloudflare/mcp-worker/src/auth.ts",
  import.meta.url,
).href;
const worker = (await import(/* @vite-ignore */ workerAuthUrl)) as WorkerAuth;

const SECRET = "introspect-secret-for-tests";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

/** A real sliding budget per (limiter, key), so lockouts are observable. */
function useCountingBudgets() {
  const limits = new Map<unknown, number>([
    [lib.mcpClientRegistrationIpLimiter, lib.MCP_CLIENT_REGISTRATIONS_PER_IP_PER_MINUTE],
    [lib.mcpClientRegistrationLimiter, lib.MCP_CLIENT_REGISTRATIONS_PER_MINUTE],
    [lib.mcpAuthorizeIpLimiter, lib.MCP_AUTHORIZE_PER_IP_PER_MINUTE],
    [lib.mcpAuthorizeClientLimiter, lib.MCP_AUTHORIZE_PER_CLIENT_PER_MINUTE],
  ]);
  const used = new Map<string, number>();
  enforceRateLimit.mockImplementation(async (limiter: unknown, key: string) => {
    const limit = limits.get(limiter);
    if (limit === undefined) throw new Error("unexpected limiter");
    const id = `${[...limits.keys()].indexOf(limiter)}:${key}`;
    const count = (used.get(id) ?? 0) + 1;
    if (count > limit) {
      return { allowed: false, status: 429, error: "Too many requests. Try again later." };
    }
    used.set(id, count);
    return { allowed: true };
  });
}

async function buildApp() {
  const app = Fastify();
  await app.register(registerMcpOAuthRoutes);
  await app.ready();
  return app;
}

let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  kv.clear();
  vi.clearAllMocks();
  vi.stubEnv("MCP_OAUTH_INTROSPECT_SECRET", SECRET);
  enforceRateLimit.mockResolvedValue({ allowed: true });
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signedHeaders(ip: string) {
  return {
    [lib.MCP_PROXY_CLIENT_IP_HEADER]: ip,
    [lib.MCP_PROXY_CLIENT_IP_SIGNATURE_HEADER]: await worker.signClientIp(ip, SECRET),
  };
}

describe("caller address for MCP OAuth budgets", () => {
  it("trusts the address the worker signed and ignores a forged one", async () => {
    const headers = await signedHeaders("203.0.113.7");
    expect(lib.resolveMcpOAuthCallerIp({ headers, ip: "10.0.0.1", secret: SECRET })).toBe(
      "203.0.113.7",
    );
    // The worker and the API agree on the signature byte for byte.
    expect(headers[lib.MCP_PROXY_CLIENT_IP_SIGNATURE_HEADER]).toBe(
      lib.signMcpProxyClientIp("203.0.113.7", SECRET),
    );

    for (const forged of [
      { ...headers, [lib.MCP_PROXY_CLIENT_IP_HEADER]: "198.51.100.1" },
      { [lib.MCP_PROXY_CLIENT_IP_HEADER]: "198.51.100.1" },
      { ...headers, [lib.MCP_PROXY_CLIENT_IP_SIGNATURE_HEADER]: "x" },
    ]) {
      expect(lib.resolveMcpOAuthCallerIp({ headers: forged, ip: "10.0.0.1", secret: SECRET })).toBe(
        "10.0.0.1",
      );
    }
    // Without the secret configured nothing forwarded is trusted.
    expect(lib.resolveMcpOAuthCallerIp({ headers, ip: "10.0.0.1", secret: undefined })).toBe(
      "10.0.0.1",
    );
  });

  it("buckets IPv6 callers per /64 and mapped IPv4 as IPv4", () => {
    expect(lib.mcpOAuthCallerBucket("2001:db8:1:2:aaaa::1")).toBe("ip6:2001:db8:1:2::/64");
    expect(lib.mcpOAuthCallerBucket("2001:0db8:0001:0002:ffff:1:2:3")).toBe(
      "ip6:2001:db8:1:2::/64",
    );
    expect(lib.mcpOAuthCallerBucket("2001:db8::1")).toBe("ip6:2001:db8:0:0::/64");
    expect(lib.mcpOAuthCallerBucket("::1")).toBe("ip6:0:0:0:0::/64");
    expect(lib.mcpOAuthCallerBucket("::ffff:192.0.2.5")).toBe("ip:192.0.2.5");
    expect(lib.mcpOAuthCallerBucket("192.0.2.5")).toBe("ip:192.0.2.5");
    expect(lib.mcpOAuthCallerBucket(undefined)).toBe("ip:unknown");
  });

  it("has the worker forward the Cloudflare caller address, signed", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await worker.proxyOAuthRequest(
      new Request("https://mcp.social0.app/oauth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
        body: "{}",
      }),
      { API_BASE_URL: "https://api.social0.app", MCP_OAUTH_INTROSPECT_SECRET: SECRET },
      "/oauth/register",
    );
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const sent = Object.fromEntries(new Headers(init.headers).entries());
    expect(
      lib.resolveMcpOAuthCallerIp({ headers: sent, ip: "104.16.0.1", secret: SECRET }),
    ).toBe("203.0.113.9");
  });
});

describe("POST /oauth/register budgets", () => {
  const register = async (headers: Record<string, string> = {}) =>
    app.inject({
      method: "POST",
      url: "/oauth/register",
      headers,
      payload: { redirect_uris: ["https://x.example/cb"] },
    });

  it("lets other callers register while one caller is over its budget", async () => {
    useCountingBudgets();
    const attacker = await signedHeaders("198.51.100.66");
    for (let i = 0; i < lib.MCP_CLIENT_REGISTRATIONS_PER_IP_PER_MINUTE; i += 1) {
      expect((await register(attacker)).statusCode).toBe(201);
    }
    expect((await register(attacker)).statusCode).toBe(429);
    // Real hosts behind other addresses, and direct callers, still register.
    expect((await register(await signedHeaders("203.0.113.20"))).statusCode).toBe(201);
    expect((await register()).statusCode).toBe(201);
  });

  it("keeps the app-wide ceiling far above one caller's budget", () => {
    expect(lib.MCP_CLIENT_REGISTRATIONS_PER_MINUTE).toBeGreaterThanOrEqual(
      lib.MCP_CLIENT_REGISTRATIONS_PER_IP_PER_MINUTE * 30,
    );
  });
});

describe("GET /oauth/authorize", () => {
  async function registeredClient() {
    const client = await lib.registerMcpOAuthClient({
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
    });
    vi.clearAllMocks();
    enforceRateLimit.mockResolvedValue({ allowed: true });
    return client.client_id;
  }

  const authorize = (params: Record<string, string | string[]>, headers: Record<string, string> = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const v of Array.isArray(value) ? value : [value]) search.append(key, v);
    }
    return app.inject({ method: "GET", url: `/oauth/authorize?${search}`, headers });
  };

  const sessionWrites = () =>
    mockRedis.set.mock.calls.filter(([key]) => String(key).startsWith("mcp:oauth:session:"));

  it("stores a session for a well-formed request, under caller and client budgets", async () => {
    const clientId = await registeredClient();
    const res = await authorize(
      {
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
        state: "s".repeat(lib.MCP_AUTHORIZE_STATE_MAX_LENGTH),
        scope: "social0:read social0:write",
        resource: "https://mcp.social0.app/mcp",
      },
      await signedHeaders("203.0.113.7"),
    );
    expect(res.statusCode).toBe(302);
    expect(sessionWrites()).toHaveLength(1);
    expect(enforceRateLimit.mock.calls.map((call) => call[1])).toEqual([
      "ip:203.0.113.7",
      `client:${clientId}`,
    ]);
  });

  it.each([
    ["an oversized state", { state: "s".repeat(15_000) }],
    ["an oversized scope", { scope: "x".repeat(600) }],
    ["an oversized resource", { resource: `https://a.example/${"x".repeat(600)}` }],
    ["a short code_challenge", { code_challenge: "x" }],
    ["an oversized code_challenge", { code_challenge: "a".repeat(129) }],
    ["a non-base64url code_challenge", { code_challenge: `${"a".repeat(42)}=` }],
    ["a repeated state", { state: ["a", "b"] }],
    ["an oversized client_id", { client_id: "c".repeat(129) }],
  ])("refuses %s before spending Redis", async (_label, override) => {
    const clientId = await registeredClient();
    mockRedis.get.mockClear();
    const res = await authorize({
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      ...override,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
    expect(sessionWrites()).toHaveLength(0);
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("stops one caller at its budget without blocking other callers", async () => {
    const clientId = await registeredClient();
    const otherClient = await registeredClient();
    useCountingBudgets();
    const params = { client_id: clientId, redirect_uri: REDIRECT, code_challenge: CHALLENGE };
    const attacker = await signedHeaders("198.51.100.66");
    for (let i = 0; i < lib.MCP_AUTHORIZE_PER_IP_PER_MINUTE; i += 1) {
      expect((await authorize(params, attacker)).statusCode).toBe(302);
    }
    const blocked = await authorize(params, attacker);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toBe("temporarily_unavailable");
    expect(sessionWrites()).toHaveLength(lib.MCP_AUTHORIZE_PER_IP_PER_MINUTE);

    // Another client from another address is unaffected.
    const other = await authorize(
      { ...params, client_id: otherClient },
      await signedHeaders("203.0.113.7"),
    );
    expect(other.statusCode).toBe(302);
  });

  it("caps sessions per client across many addresses", async () => {
    const clientId = await registeredClient();
    useCountingBudgets();
    const params = { client_id: clientId, redirect_uri: REDIRECT, code_challenge: CHALLENGE };
    for (let i = 0; i < lib.MCP_AUTHORIZE_PER_CLIENT_PER_MINUTE; i += 1) {
      const res = await authorize(params, await signedHeaders(`198.51.100.${i + 1}`));
      expect(res.statusCode).toBe(302);
    }
    const res = await authorize(params, await signedHeaders("203.0.113.200"));
    expect(res.statusCode).toBe(429);
    expect(sessionWrites()).toHaveLength(lib.MCP_AUTHORIZE_PER_CLIENT_PER_MINUTE);
  });
});
