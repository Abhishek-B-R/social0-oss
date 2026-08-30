import { describe, expect, it } from "vitest";
import {
  isGonePlatformPost,
  isInboxFetchNotice,
  noteFetchError,
  noteFetchNotice,
  sanitizeInboxFetchError,
} from "../lib/inbox/fetch-errors.js";

describe("isGonePlatformPost", () => {
  it("matches YouTube missing videos and Bluesky missing posts", () => {
    expect(
      isGonePlatformPost(
        'The video identified by the `videoId` parameter could not be found. <a href="https://developers.google.com">docs</a>',
      ),
    ).toBe(true);
    expect(
      isGonePlatformPost(
        "Post not found: at://did:plc:abc/app.bsky.feed.post/3mqi4kzzrgu22",
      ),
    ).toBe(true);
    expect(isGonePlatformPost("Request failed with code 401")).toBe(false);
  });
});

describe("sanitizeInboxFetchError", () => {
  it("strips HTML from Google error copy", () => {
    const msg = sanitizeInboxFetchError(
      'The video identified by the `videoId` parameter could not be found. <a href="https://x">Learn more</a>',
    );
    expect(msg).toBe("Post is no longer available on the platform.");
    expect(msg).not.toContain("<a");
  });
});

describe("noteFetchError", () => {
  it("does not record gone posts, and collapses the same platform error", () => {
    const list: Array<{ accountId: string; platform: string; error: string }> = [];
    noteFetchError(list, {
      accountId: "pub-1",
      platform: "unknown",
      error: "Connected account was removed.",
    });
    noteFetchError(list, {
      accountId: "pub-2",
      platform: "unknown",
      error: "Connected account was removed.",
    });
    noteFetchError(list, {
      accountId: "yt-1",
      platform: "youtube",
      error: "The video identified by the `videoId` parameter could not be found.",
    });
    noteFetchError(list, {
      accountId: "x-1",
      platform: "twitter_x",
      error: "Request failed with code 401",
    });
    expect(list).toEqual([
      {
        accountId: "pub-1",
        platform: "unknown",
        error: "Connected account was removed.",
      },
      {
        accountId: "x-1",
        platform: "twitter_x",
        error: "Request failed with code 401",
      },
    ]);
  });
});

describe("isInboxFetchNotice", () => {
  it("flags advisory platform window copy", () => {
    expect(isInboxFetchNotice("X comments only go back 7 days (Recent Search).")).toBe(
      true,
    );
    expect(isInboxFetchNotice("Request failed with code 401")).toBe(false);
  });
});

describe("noteFetchNotice", () => {
  it("dedupes notices by platform and message", () => {
    const list: Array<{ platform: string; message: string }> = [];
    noteFetchNotice(list, {
      platform: "twitter_x",
      message: "X comments only go back 7 days (Recent Search).",
    });
    noteFetchNotice(list, {
      platform: "twitter_x",
      message: "X comments only go back 7 days (Recent Search).",
    });
    expect(list).toHaveLength(1);
  });
});
