import { describe, expect, it } from "vitest";
import {
  FACEBOOK_INSTAGRAM_PAGE_SCOPES,
  FACEBOOK_PAGE_SCOPES,
  sanitizeFacebookScopes,
} from "@social0/shared";
import { PLATFORM_OAUTH_CONFIG } from "../lib/platforms.js";

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
  process.env.ENCRYPTION_KEY ??=
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.RESEND_API_KEY ??= "re_test";
  process.env.RESEND_FROM_EMAIL ??= "test@social0.app";
}

stubServerEnv();

const { buildFacebookOAuthUrl } = await import("../lib/facebook-oauth.js");

describe("Facebook Page scopes", () => {
  it("never includes Messenger or pages_read_user_content", () => {
    expect(FACEBOOK_PAGE_SCOPES).not.toContain("pages_messaging");
    expect(FACEBOOK_PAGE_SCOPES).not.toContain("pages_read_user_content");
    expect(FACEBOOK_PAGE_SCOPES).not.toContain("pages_manage_engagement");
    expect(FACEBOOK_PAGE_SCOPES).toContain("read_insights");
    expect(FACEBOOK_PAGE_SCOPES).not.toContain("business_management");
    expect(FACEBOOK_INSTAGRAM_PAGE_SCOPES).not.toContain("pages_manage_engagement");
    expect(FACEBOOK_INSTAGRAM_PAGE_SCOPES).toBe(FACEBOOK_PAGE_SCOPES);
    expect(PLATFORM_OAUTH_CONFIG.facebook?.scope).toBe(FACEBOOK_PAGE_SCOPES);
  });

  it("strips blocked permissions from a stale scope string", () => {
    expect(
      sanitizeFacebookScopes(
        `${FACEBOOK_PAGE_SCOPES},pages_messaging,pages_manage_engagement,pages_read_user_content,read_insights,business_management`,
      ),
    ).toBe(FACEBOOK_PAGE_SCOPES);
  });

  it("allowlist is publish plus read_insights for analytics", () => {
    expect(FACEBOOK_PAGE_SCOPES).toBe(
      "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights",
    );
  });
});

describe("buildFacebookOAuthUrl", () => {
  it("sends Page scopes and never sends config_id", () => {
    const url = new URL(
      buildFacebookOAuthUrl({
        clientId: "app",
        redirectUri: "https://api.social0.app/api/connect/facebook/callback",
        state: "s",
        configId: "stale-login-config",
        scope: FACEBOOK_PAGE_SCOPES,
      }),
    );
    expect(url.searchParams.get("scope")).toBe(FACEBOOK_PAGE_SCOPES);
    expect(url.searchParams.get("config_id")).toBeNull();
    expect(url.searchParams.get("scope")).not.toContain("pages_read_user_content");
  });

  it("drops pages_messaging even if a caller passes it", () => {
    const url = new URL(
      buildFacebookOAuthUrl({
        clientId: "app",
        redirectUri: "https://api.social0.app/api/connect/facebook/callback",
        state: "s",
        configId: "login-config",
        scope: `${FACEBOOK_PAGE_SCOPES},pages_messaging,pages_read_user_content,pages_manage_engagement`,
      }),
    );
    expect(url.searchParams.get("config_id")).toBeNull();
    expect(url.searchParams.get("scope")).toBe(FACEBOOK_PAGE_SCOPES);
  });
});
