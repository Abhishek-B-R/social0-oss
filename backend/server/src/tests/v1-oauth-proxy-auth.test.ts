/**
 * `/v1` authenticates an MCP OAuth access token itself, so the mcp-worker no
 * longer needs (and introspection no longer hands out) the raw connector API
 * key. A token is accepted only with the worker's signature over that exact
 * token: tokens are issued for the MCP resource, and a host holding one must
 * not be able to call the API directly with it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { signMcpProxyToken, MCP_PROXY_TOKEN_SIGNATURE_HEADER } from "../lib/mcp-oauth.js";
import { resolveV1Caller } from "../middleware/api-auth.js";

const SECRET = "test-introspect-secret";
const TOKEN = "test-access-token";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MCP_OAUTH_INTROSPECT_SECRET = SECRET;
  mockResolveToken.mockResolvedValue({
    userId: "user_1",
    apiKeyId: "key-1",
    clientId: "mcp_client",
    scope: "posts:read media:write",
    expiresAt: 9_999_999_999,
    resource: "https://mcp.social0.app/mcp",
  });
  mockResolveRawKey.mockResolvedValue({ userId: "user_2", apiKeyId: "key-2" });
});

function headers(extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${TOKEN}`, ...extra };
}

describe("resolveV1Caller", () => {
  it("accepts an OAuth token the worker signed, with the token's scopes", async () => {
    const caller = await resolveV1Caller(
      headers({ [MCP_PROXY_TOKEN_SIGNATURE_HEADER]: signMcpProxyToken(TOKEN, SECRET) }),
    );
    expect(caller).toEqual({
      userId: "user_1",
      apiKeyId: "key-1",
      scopes: ["posts:read", "media:write"],
    });
  });

  it("rejects an OAuth token sent straight to the API without the signature", async () => {
    expect(await resolveV1Caller(headers())).toBeNull();
    expect(mockResolveToken).not.toHaveBeenCalled();
  });

  it("rejects a signature made for a different token", async () => {
    const caller = await resolveV1Caller(
      headers({ [MCP_PROXY_TOKEN_SIGNATURE_HEADER]: signMcpProxyToken("other-token", SECRET) }),
    );
    expect(caller).toBeNull();
  });

  it("rejects a signature made with another secret", async () => {
    const caller = await resolveV1Caller(
      headers({ [MCP_PROXY_TOKEN_SIGNATURE_HEADER]: signMcpProxyToken(TOKEN, "wrong") }),
    );
    expect(caller).toBeNull();
  });

  it("rejects every OAuth token when the API has no proxy secret", async () => {
    delete process.env.MCP_OAUTH_INTROSPECT_SECRET;
    const caller = await resolveV1Caller(
      headers({ [MCP_PROXY_TOKEN_SIGNATURE_HEADER]: signMcpProxyToken(TOKEN, SECRET) }),
    );
    expect(caller).toBeNull();
  });

  it("rejects a signed token whose grant is dead", async () => {
    mockResolveToken.mockResolvedValue(null);
    const caller = await resolveV1Caller(
      headers({ [MCP_PROXY_TOKEN_SIGNATURE_HEADER]: signMcpProxyToken(TOKEN, SECRET) }),
    );
    expect(caller).toBeNull();
  });

  it("rejects a signed token issued for another resource", async () => {
    mockResolveToken.mockResolvedValue({
      userId: "user_1",
      apiKeyId: "key-1",
      clientId: "mcp_client",
      scope: "posts:read",
      expiresAt: 9_999_999_999,
      resource: "https://elsewhere.example/api",
    });
    const caller = await resolveV1Caller(
      headers({ [MCP_PROXY_TOKEN_SIGNATURE_HEADER]: signMcpProxyToken(TOKEN, SECRET) }),
    );
    expect(caller).toBeNull();
  });

  it("still accepts an API key, with full access", async () => {
    const caller = await resolveV1Caller({ authorization: "Bearer sk_live_abc" });
    expect(caller).toEqual({ userId: "user_2", apiKeyId: "key-2", scopes: null });
  });

  it("signs exactly as the mcp-worker does", async () => {
    // The worker signs with WebCrypto (signProxyToken in
    // cloudflare/mcp-worker/src/auth.ts); compute it that way here.
    const enc = new TextEncoder();
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", enc.encode(TOKEN))).toString("hex");
    const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`social0-mcp-proxy:${hash}`));
    expect(signMcpProxyToken(TOKEN, SECRET)).toBe(Buffer.from(mac).toString("base64url"));
  });
});
