/**
 * Regressions for live inbox / analytics error classification:
 * - a post deleted on Meta (Graph code 100 / subcode 33, "...missing
 *   permissions...") must not read as a missing scope ("Reconnect");
 * - YouTube quota exhaustion (HTTP 403 quotaExceeded) must not read as a
 *   missing scope either;
 * - platform throttles must THROW (status 429) so withPlatformReadCache sets a
 *   cooldown and serves the saved copy, instead of degrading to a red error.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  graphApiError,
  isGraphObjectGone,
  isGraphPermissionError,
  isGraphRateLimit,
} from "../lib/graph-api-errors.js";
import {
  fetchPublicationComments,
  type CommentFetchInput,
} from "../lib/inbox/fetch-comments.js";
import { fetchAccountDms, type DmAccount } from "../lib/inbox/fetch-dms.js";
import { fetchPlatformPublicationMetrics } from "../lib/analytics/fetch-platform-metrics.js";
import { isPlatformRateLimitError } from "../lib/platform-api-cache.js";
import {
  isYouTubeThrottle,
  PlatformRateLimitError,
  rethrowIfRateLimited,
} from "../lib/platform-rate-limit.js";

const DELETED_POST = {
  error: {
    message:
      "Unsupported get request. Object with ID '1789' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api",
    type: "GraphMethodException",
    code: 100,
    error_subcode: 33,
  },
};

const MISSING_PERMISSION = {
  error: {
    message: "(#10) Application does not have permission for this action",
    type: "OAuthException",
    code: 10,
  },
};

const INVALID_FIELD = {
  error: {
    message: "(#100) Tried accessing nonexisting field (bogus) on node type (IGMedia)",
    type: "OAuthException",
    code: 100,
  },
};

const APP_THROTTLED = {
  error: {
    message: "(#4) Application request limit reached",
    type: "OAuthException",
    code: 4,
  },
};

function youtubeError(reason: string, message: string) {
  return {
    error: {
      code: 403,
      message,
      errors: [{ message, domain: "youtube.quota", reason }],
    },
  };
}

function respond(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function commentInput(platform: string): CommentFetchInput {
  return {
    platform,
    platformPostId: "1789",
    platformPostUrl: null,
    platformUserId: "me",
    accessToken: "token",
    accountId: "acc",
    accountLabel: "creator",
    postId: "post",
    publicationId: "pub",
    postSnippet: "hi",
    postContent: "hi",
  };
}

function dmAccount(platform: string): DmAccount {
  return {
    id: "acc",
    platform,
    platformUserId: "me",
    platformUsername: "creator",
    ownerUserId: "user",
    profileImageUrl: null,
    accessToken: "token",
    accessSecret: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Graph error classification", () => {
  it("treats code 100 / subcode 33 as a gone post, not a permission gap", () => {
    const e = graphApiError(DELETED_POST, "x");
    expect(isGraphObjectGone(e)).toBe(true);
    expect(isGraphPermissionError(e)).toBe(false);
  });

  it("does not read every '(#100)' error as permission code 10", () => {
    const e = graphApiError(INVALID_FIELD, "x");
    expect(isGraphPermissionError(e)).toBe(false);
    expect(isGraphObjectGone(e)).toBe(false);
  });

  it("uses Graph permission codes 10 and 200-299", () => {
    expect(isGraphPermissionError(graphApiError(MISSING_PERMISSION, "x"))).toBe(true);
    expect(isGraphPermissionError({ message: "(#200) nope", code: 200 })).toBe(true);
    expect(isGraphPermissionError({ message: "Requires manage_comments", code: 1 }, /manage_comments/)).toBe(true);
    // No code at all: fall back to the message.
    expect(isGraphPermissionError({ message: "missing permission" })).toBe(true);
  });

  it("recognizes Graph throttling codes", () => {
    expect(isGraphRateLimit(graphApiError(APP_THROTTLED, "x"))).toBe(true);
    expect(isGraphRateLimit({ message: "", code: 17 })).toBe(true);
    expect(isGraphRateLimit({ message: "", code: 80002 })).toBe(true);
    expect(isGraphRateLimit({ message: "", code: 100 })).toBe(false);
    expect(isGraphRateLimit({ message: "" }, 429)).toBe(true);
  });
});

describe("inbox comments: deleted Meta posts", () => {
  it.each(["facebook", "instagram", "threads"])(
    "%s: a deleted post returns no comments instead of scope_missing",
    async (platform) => {
      vi.stubGlobal("fetch", respond(400, DELETED_POST));
      const result = await fetchPublicationComments(commentInput(platform));
      expect(result.status).toBe("ok");
      expect(result.comments).toEqual([]);
      expect(result.missingScopes).toBeUndefined();
    },
  );

  it.each([
    ["facebook", "pages_manage_engagement"],
    ["instagram", "instagram_business_manage_comments"],
    ["threads", "threads_manage_replies"],
  ])("%s: a real permission error still asks for %s", async (platform, scope) => {
    vi.stubGlobal("fetch", respond(403, MISSING_PERMISSION));
    const result = await fetchPublicationComments(commentInput(platform));
    expect(result.status).toBe("scope_missing");
    expect(result.missingScopes).toEqual([scope]);
  });

  it("an invalid-field (#100) error is a plain error, not a reconnect", async () => {
    vi.stubGlobal("fetch", respond(400, INVALID_FIELD));
    const result = await fetchPublicationComments(commentInput("instagram"));
    expect(result.status).toBe("error");
    expect(result.missingScopes).toBeUndefined();
  });

  it("a Graph throttle throws a 429 so the cache can cool down", async () => {
    vi.stubGlobal("fetch", respond(400, APP_THROTTLED));
    const p = fetchPublicationComments(commentInput("instagram"));
    await expect(p).rejects.toBeInstanceOf(PlatformRateLimitError);
    await p.catch((e) => expect(isPlatformRateLimitError(e)).toBe(true));
  });

  it("threads does not spend the /replies fallback when throttled", async () => {
    const fetchMock = respond(400, APP_THROTTLED);
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublicationComments(commentInput("threads"))).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("inbox comments: YouTube 403s", () => {
  it("quotaExceeded throws a throttle instead of scope_missing", async () => {
    vi.stubGlobal(
      "fetch",
      respond(403, youtubeError("quotaExceeded", "The request cannot be completed because you have exceeded your quota.")),
    );
    const p = fetchPublicationComments(commentInput("youtube"));
    await expect(p).rejects.toBeInstanceOf(PlatformRateLimitError);
    await p.catch((e) => expect(isPlatformRateLimitError(e)).toBe(true));
  });

  it("rateLimitExceeded and HTTP 429 are throttles too", () => {
    expect(isYouTubeThrottle(403, youtubeError("rateLimitExceeded", "slow down"))).toBe(true);
    expect(isYouTubeThrottle(403, youtubeError("userRateLimitExceeded", "slow down"))).toBe(true);
    expect(isYouTubeThrottle(429, {})).toBe(true);
    expect(isYouTubeThrottle(403, youtubeError("insufficientPermissions", "no"))).toBe(false);
  });

  it("insufficientPermissions is still a reconnect", async () => {
    vi.stubGlobal(
      "fetch",
      respond(403, youtubeError("insufficientPermissions", "Request had insufficient authentication scopes.")),
    );
    const result = await fetchPublicationComments(commentInput("youtube"));
    expect(result.status).toBe("scope_missing");
  });

  it("an unrelated 403 (API not enabled) is an error, not a reconnect", async () => {
    vi.stubGlobal(
      "fetch",
      respond(403, youtubeError("accessNotConfigured", "YouTube Data API v3 has not been used in project 1 before.")),
    );
    const result = await fetchPublicationComments(commentInput("youtube"));
    expect(result.status).toBe("error");
    expect(result.missingScopes).toBeUndefined();
  });
});

describe("live fetchers hand throttles to the cache layer", () => {
  it("rethrowIfRateLimited passes 429s through and nothing else", () => {
    expect(() => rethrowIfRateLimited({ code: 429 })).toThrow();
    expect(() => rethrowIfRateLimited(new Error("Request failed with code 429"))).toThrow();
    expect(() => rethrowIfRateLimited(new Error("Request failed with code 403"))).not.toThrow();
  });

  it("LinkedIn comments: HTTP 429 throws", async () => {
    vi.stubGlobal("fetch", respond(429, { message: "Too many requests" }));
    await expect(fetchPublicationComments(commentInput("linkedin"))).rejects.toBeInstanceOf(
      PlatformRateLimitError,
    );
  });

  it("Instagram DMs: a Graph throttle throws", async () => {
    vi.stubGlobal("fetch", respond(400, APP_THROTTLED));
    await expect(
      fetchAccountDms(dmAccount("instagram"), new Date(0), new Date()),
    ).rejects.toBeInstanceOf(PlatformRateLimitError);
  });

  it("TikTok DMs: HTTP 429 throws", async () => {
    vi.stubGlobal("fetch", respond(429, { code: 50001, message: "rate limited" }));
    await expect(
      fetchAccountDms(dmAccount("tiktok"), new Date(0), new Date()),
    ).rejects.toBeInstanceOf(PlatformRateLimitError);
  });
});

describe("analytics: deleted posts and throttles", () => {
  const metricsInput = (platform: string) => ({
    platform,
    platformPostId: "1789",
    platformUserId: "page",
    accessToken: "token",
  });

  it("a deleted Instagram post is an error, not a missing insights scope", async () => {
    vi.stubGlobal("fetch", respond(400, DELETED_POST));
    const result = await fetchPlatformPublicationMetrics(metricsInput("instagram"));
    expect(result.status).toBe("error");
    expect(result.missingScopes).toBeUndefined();
    expect(result.error).toMatch(/no longer available/i);
  });

  it("a deleted Threads post is an error, not a missing insights scope", async () => {
    vi.stubGlobal("fetch", respond(400, DELETED_POST));
    const result = await fetchPlatformPublicationMetrics(metricsInput("threads"));
    expect(result.status).toBe("error");
    expect(result.missingScopes).toBeUndefined();
  });

  it("a deleted Facebook post is an error, not a missing read_insights scope", async () => {
    vi.stubGlobal("fetch", respond(400, DELETED_POST));
    const result = await fetchPlatformPublicationMetrics({
      ...metricsInput("facebook"),
      platformPostId: "page_1789",
    });
    expect(result.status).toBe("error");
    expect(result.missingScopes).toBeUndefined();
  });

  it("a real Threads permission error still asks for the insights scope", async () => {
    vi.stubGlobal("fetch", respond(403, MISSING_PERMISSION));
    const result = await fetchPlatformPublicationMetrics(metricsInput("threads"));
    expect(result.status).toBe("scope_missing");
    expect(result.missingScopes).toEqual(["threads_manage_insights"]);
  });

  it("YouTube quota exhaustion throws a throttle", async () => {
    vi.stubGlobal("fetch", respond(403, youtubeError("quotaExceeded", "quota")));
    await expect(
      fetchPlatformPublicationMetrics(metricsInput("youtube")),
    ).rejects.toBeInstanceOf(PlatformRateLimitError);
  });

  it("a Graph throttle on Facebook throws", async () => {
    vi.stubGlobal("fetch", respond(400, APP_THROTTLED));
    await expect(
      fetchPlatformPublicationMetrics({ ...metricsInput("facebook"), platformPostId: "page_1789" }),
    ).rejects.toBeInstanceOf(PlatformRateLimitError);
  });
});
