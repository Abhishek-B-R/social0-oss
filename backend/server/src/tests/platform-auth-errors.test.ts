/**
 * A dead platform token must surface as "reconnect", not as a transient
 * fetch error, on every live surface (comments, analytics, DMs).
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

const searchMock = vi.fn();

vi.mock("twitter-api-v2", () => ({
  TwitterApi: class {
    v2 = { search: searchMock };
  },
}));

import {
  isPlatformAuthError,
  TOKEN_EXPIRED_MARKER,
} from "../lib/platform-auth-errors.js";

describe("isPlatformAuthError", () => {
  it("recognizes a bare HTTP 401 on the error object", () => {
    expect(isPlatformAuthError({ code: 401 })).toBe(true);
    expect(isPlatformAuthError({ status: 401 })).toBe(true);
    expect(isPlatformAuthError({ response: { status: 401 } })).toBe(true);
  });

  it("recognizes X's token error codes", () => {
    expect(
      isPlatformAuthError({ data: { errors: [{ code: 89, message: "Invalid or expired token." }] } }),
    ).toBe(true);
    expect(isPlatformAuthError({ errors: [{ code: 32 }] })).toBe(true);
  });

  it("recognizes the SDK's opaque message form", () => {
    expect(isPlatformAuthError(new Error("Request failed with code 401"))).toBe(true);
    expect(isPlatformAuthError("Invalid Credentials", 401)).toBe(true);
    expect(isPlatformAuthError("Could not authenticate you")).toBe(true);
  });

  it("leaves permission, rate-limit, and not-found alone", () => {
    expect(isPlatformAuthError({ code: 403 })).toBe(false);
    expect(isPlatformAuthError({ code: 429 })).toBe(false);
    expect(isPlatformAuthError(new Error("Request failed with code 404"))).toBe(false);
    expect(isPlatformAuthError("Forbidden: insufficient scope", 403)).toBe(false);
  });
});

describe("X comment batch on an expired token", () => {
  beforeAll(() => {
    vi.stubEnv("TWITTER_CONSUMER_KEY", "app-key");
    vi.stubEnv("TWITTER_CONSUMER_SECRET", "app-secret");
  });

  it("maps a 401 to a reconnect hint instead of a raw error", async () => {
    const { fetchTwitterCommentsBatch } = await import(
      "../lib/inbox/fetch-comments.js"
    );
    searchMock.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with code 401"), { code: 401 }),
    );
    const out = await fetchTwitterCommentsBatch([
      {
        platform: "twitter_x",
        platformPostId: "111",
        platformPostUrl: null,
        platformUserId: "u1",
        accessToken: "t",
        accessSecret: "s",
        accountId: "a1",
        accountLabel: "handle",
        postId: "post-1",
        publicationId: "pub-1",
        postSnippet: "snippet",
        postContent: "content",
      },
    ]);
    const result = out["pub-1"]!;
    expect(result.status).toBe("scope_missing");
    expect(result.missingScopes).toEqual([TOKEN_EXPIRED_MARKER]);
    expect(result.error).toMatch(/reconnect/i);
  });

  it("still reports other failures as plain errors", async () => {
    const { fetchTwitterCommentsBatch } = await import(
      "../lib/inbox/fetch-comments.js"
    );
    searchMock.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with code 503"), { code: 503 }),
    );
    const out = await fetchTwitterCommentsBatch([
      {
        platform: "twitter_x",
        platformPostId: "222",
        platformPostUrl: null,
        platformUserId: "u1",
        accessToken: "t",
        accessSecret: "s",
        accountId: "a1",
        accountLabel: "handle",
        postId: "post-2",
        publicationId: "pub-2",
        postSnippet: "snippet",
        postContent: "content",
      },
    ]);
    expect(out["pub-2"]!.status).toBe("error");
    expect(out["pub-2"]!.missingScopes).toBeUndefined();
  });
});
