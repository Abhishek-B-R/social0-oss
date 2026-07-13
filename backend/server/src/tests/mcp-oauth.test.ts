import { beforeAll, describe, expect, it } from "vitest";

function stubServerEnv() {
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/social0_test";
  process.env.BETTER_AUTH_URL ??= "https://api.social0.app";
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret-32chars-min!!";
  process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
  process.env.NEXT_PUBLIC_APP_URL ??= "https://social0.app";
  process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN ??= "test-upstash-token";
  process.env.ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.RESEND_API_KEY ??= "re_test";
  process.env.RESEND_FROM_EMAIL ??= "test@social0.app";
}

stubServerEnv();

const {
  getMcpOAuthMetadata,
  getMcpProtectedResourceMetadata,
  validateMcpRedirectUris,
} = await import("../lib/mcp-oauth.js");

describe("validateMcpRedirectUris", () => {
  beforeAll(stubServerEnv);

  it("accepts https and localhost http", () => {
    expect(() =>
      validateMcpRedirectUris([
        "https://claude.ai/api/mcp/auth_callback",
        "http://localhost:8787/callback",
        "http://127.0.0.1:3000/cb",
      ]),
    ).not.toThrow();
  });

  it("rejects empty list", () => {
    expect(() => validateMcpRedirectUris([])).toThrow(/redirect_uris required/);
  });

  it("rejects non-https remote URIs", () => {
    expect(() => validateMcpRedirectUris(["http://evil.example/callback"])).toThrow(
      /Invalid redirect_uri/,
    );
    expect(() => validateMcpRedirectUris(["javascript:alert(1)"])).toThrow(/Invalid redirect_uri/);
  });
});

describe("MCP OAuth metadata", () => {
  it("advertises revocation and branding links", () => {
    const oauth = getMcpOAuthMetadata("https://mcp.social0.app");
    expect(oauth.revocation_endpoint).toBe("https://mcp.social0.app/oauth/revoke");
    expect(oauth.code_challenge_methods_supported).toEqual(["S256"]);

    const resource = getMcpProtectedResourceMetadata("https://mcp.social0.app/");
    expect(resource.resource).toBe("https://mcp.social0.app/mcp");
    expect(resource.resource_icon).toBe("https://social0.app/logo.png");
    expect(resource.resource_policy_uri).toBe("https://social0.app/privacy");
  });
});
