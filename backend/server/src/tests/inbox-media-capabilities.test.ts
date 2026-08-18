import { describe, expect, it } from "vitest";
import {
  inboxAllowsMedia,
  inboxCommentMediaKinds,
  inboxDmMediaKinds,
} from "../lib/inbox/media-capabilities.js";

describe("inboxDmMediaKinds", () => {
  it("allows image/video on IG and X; image on TikTok; none on Bluesky", () => {
    expect(inboxDmMediaKinds("instagram")).toEqual(["image", "video"]);
    expect(inboxDmMediaKinds("facebook")).toEqual([]);
    expect(inboxDmMediaKinds("twitter_x")).toEqual(["image", "video"]);
    expect(inboxDmMediaKinds("tiktok")).toEqual(["image"]);
    expect(inboxDmMediaKinds("bluesky")).toEqual([]);
  });
});

describe("inboxCommentMediaKinds", () => {
  it("allows X image+video and Bluesky image only", () => {
    expect(inboxCommentMediaKinds("twitter_x")).toEqual(["image", "video"]);
    expect(inboxCommentMediaKinds("bluesky")).toEqual(["image"]);
    expect(inboxCommentMediaKinds("instagram")).toEqual([]);
  });
});

describe("inboxAllowsMedia", () => {
  it("matches mime types to platform rules", () => {
    expect(inboxAllowsMedia("twitter_x", "dm", "image/png")).toBe(true);
    expect(inboxAllowsMedia("twitter_x", "dm", "video/mp4")).toBe(true);
    expect(inboxAllowsMedia("bluesky", "dm", "image/png")).toBe(false);
    expect(inboxAllowsMedia("bluesky", "comment", "image/jpeg")).toBe(true);
    expect(inboxAllowsMedia("bluesky", "comment", "video/mp4")).toBe(false);
  });
});
