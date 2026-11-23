/**
 * An OAuth token only reaches the `/v1` routes its granted scopes cover, and a
 * grant holds only the scopes the client asked for. Before, every token got
 * every scope and `/v1` never looked at them.
 */

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveToken, mockResolveRawKey } = vi.hoisted(() => ({
  mockResolveToken: vi.fn(),
  mockResolveRawKey: vi.fn(),
}));

vi.mock("../lib/mcp-oauth.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mcp-oauth.js")>()),
  resolveMcpAccessTokenAuth: mockResolveToken,
}));
vi.mock("../lib/api-keys.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api-keys.js")>()),
  resolveRawApiKey: mockResolveRawKey,
}));
vi.mock("../lib/subscription.js", () => ({
  getSubscriptionForUser: vi.fn(async () => ({ tier: "pro" })),
}));
vi.mock("../lib/api-rate-limits.js", () => ({
  applyRateLimitHeaders: vi.fn(),
  enforceApiRateLimit: vi.fn(async () => ({ allowed: true, info: {} })),
  FREE_TIER_RATE_LIMIT: {},
}));

import {
  grantedMcpScopes,
  MCP_OAUTH_SCOPES,
  MCP_PROXY_TOKEN_SIGNATURE_HEADER,
  signMcpProxyToken,
} from "../lib/mcp-oauth.js";
import { requireV1ApiKey } from "../middleware/api-auth.js";

const SECRET = "test-introspect-secret";
const TOKEN = "oauth-token";

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.MCP_OAUTH_INTROSPECT_SECRET = SECRET;
  mockResolveRawKey.mockResolvedValue({ userId: "user_1", apiKeyId: "key-raw" });
  app = Fastify();
  app.addHook("preHandler", requireV1ApiKey);
  app.get("/v1/posts", async () => ({ ok: true }));
  app.post("/v1/posts/publish", async () => ({ ok: true }));
  app.get("/v1/unlisted", async () => ({ ok: true }));
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

function asOAuth(scope: string) {
  mockResolveToken.mockResolvedValue({
    userId: "user_1",
    apiKeyId: "key-1",
    clientId: "mcp_client",
    scope,
    expiresAt: 9_999_999_999,
    resource: "https://mcp.social0.app/mcp",
  });
  return {
    authorization: `Bearer ${TOKEN}`,
    [MCP_PROXY_TOKEN_SIGNATURE_HEADER]: signMcpProxyToken(TOKEN, SECRET),
  };
}

describe("/v1 scope enforcement", () => {
  it("lets a token call a route its scope covers", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/posts", headers: asOAuth("posts:read") });
    expect(res.statusCode).toBe(200);
  });

  it("accepts the umbrella scope too", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/posts", headers: asOAuth("social0:read") });
    expect(res.statusCode).toBe(200);
  });

  it("refuses a read-only token on a publish route", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/posts/publish",
      headers: asOAuth("posts:read social0:read"),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: { code: "forbidden", details: { required_scopes: ["posts:write", "social0:write"] } },
    });
    expect(res.headers["www-authenticate"]).toContain('error="insufficient_scope"');
  });

  it("refuses an OAuth token on a route with no scope mapping", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/unlisted", headers: asOAuth(MCP_OAUTH_SCOPES.join(" ")) });
    expect(res.statusCode).toBe(403);
  });

  it("leaves API keys with full access", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/posts/publish",
      headers: { authorization: "Bearer sk_live_abc" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("grantedMcpScopes", () => {
  it("grants only the requested scopes it knows", () => {
    expect(grantedMcpScopes("posts:read analytics:read made:up")).toBe("posts:read analytics:read");
  });

  it("grants everything when nothing was requested", () => {
    expect(grantedMcpScopes(undefined)).toBe(MCP_OAUTH_SCOPES.join(" "));
    expect(grantedMcpScopes("  ")).toBe(MCP_OAUTH_SCOPES.join(" "));
  });

  it("refuses a request made only of unknown scopes", () => {
    expect(grantedMcpScopes("admin:everything")).toBeNull();
  });
});
