/**
 * The worker forwards the caller's own token to the API with its signature,
 * instead of a raw API key taken from introspection.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearIntrospectionCache, resolveCredential, signProxyToken } from "./auth.js";
import type { Env } from "./env.js";

const SECRET = "test-introspect-secret";
const TOKEN = "test-access-token";
const env = {
  API_BASE_URL: "https://api.test",
  MCP_OAUTH_INTROSPECT_SECRET: SECRET,
} as Env;

const realFetch = globalThis.fetch;
let introspections = 0;
afterEach(() => {
  globalThis.fetch = realFetch;
  clearIntrospectionCache();
  introspections = 0;
});

function introspectionReturns(body: unknown) {
  globalThis.fetch = (async () => {
    introspections += 1;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function mcpRequest(token = TOKEN) {
  return new Request("https://mcp.social0.app/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("resolveCredential", () => {
  it("returns the caller's token and the signature the API checks", async () => {
    introspectionReturns({ active: true, client_name: "Claude", scope: "posts:read" });

    const credential = await resolveCredential(mcpRequest(), env);

    assert.ok(!("error" in credential));
    assert.equal(credential.token, TOKEN);
    assert.equal(credential.proxySignature, await signProxyToken(TOKEN, SECRET));
    assert.equal(credential.clientName, "Claude");
  });

  it("keeps working against an API that still returns the raw key", async () => {
    introspectionReturns({ active: true, api_key: "sk_live_legacy" });

    const credential = await resolveCredential(mcpRequest(), env);

    assert.ok(!("error" in credential));
    assert.equal(credential.token, "sk_live_legacy");
  });

  it("introspects an active token once a minute, not on every call", async () => {
    introspectionReturns({ active: true, exp: Math.floor(Date.now() / 1000) + 3600 });

    await resolveCredential(mcpRequest(), env);
    await resolveCredential(mcpRequest(), env);
    await resolveCredential(mcpRequest(), env);

    assert.equal(introspections, 1);
  });

  it("never caches an inactive answer", async () => {
    introspectionReturns({ active: false });

    await resolveCredential(mcpRequest(), env);
    await resolveCredential(mcpRequest(), env);

    assert.equal(introspections, 2);
  });

  it("does not reuse an answer past the token's expiry", async () => {
    introspectionReturns({ active: true, exp: Math.floor(Date.now() / 1000) - 1 });

    await resolveCredential(mcpRequest(), env);
    await resolveCredential(mcpRequest(), env);

    assert.equal(introspections, 2);
  });

  it("answers 401 for an inactive token", async () => {
    introspectionReturns({ active: false });

    const credential = await resolveCredential(mcpRequest(), env);

    assert.ok("error" in credential);
    assert.equal(credential.error.status, 401);
    // Without the challenge, hosts show the connector as disconnected hourly.
    assert.match(credential.error.headers.get("WWW-Authenticate") ?? "", /error="invalid_token"/);
  });

  it("signs exactly as the API verifies", async () => {
    // The API signs with node:crypto (signMcpProxyToken in
    // backend/server/src/lib/mcp-oauth.ts); this worker with WebCrypto. Same
    // construction, computed the API's way, must give the same signature.
    const { createHash, createHmac } = await import("node:crypto");
    const expected = createHmac("sha256", SECRET)
      .update(`social0-mcp-proxy:${createHash("sha256").update(TOKEN).digest("hex")}`)
      .digest("base64url");
    assert.equal(await signProxyToken(TOKEN, SECRET), expected);
  });
});
