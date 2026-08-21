import { describe, expect, it } from "vitest";
import { inboxCommentLikeSupported } from "../lib/inbox/like-comment.js";

describe("inboxCommentLikeSupported", () => {
  it("covers every comments-inbox platform that exposes likes", () => {
    expect(inboxCommentLikeSupported("facebook")).toBe(true);
    expect(inboxCommentLikeSupported("instagram")).toBe(true);
    expect(inboxCommentLikeSupported("twitter_x")).toBe(true);
    expect(inboxCommentLikeSupported("bluesky")).toBe(true);
    expect(inboxCommentLikeSupported("threads")).toBe(true);
    expect(inboxCommentLikeSupported("youtube")).toBe(true);
    expect(inboxCommentLikeSupported("linkedin")).toBe(true);
  });

  it("stays off for platforms without a comments inbox", () => {
    expect(inboxCommentLikeSupported("tiktok")).toBe(false);
    expect(inboxCommentLikeSupported("pinterest")).toBe(false);
  });
});
