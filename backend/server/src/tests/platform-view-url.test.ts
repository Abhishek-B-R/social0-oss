import { describe, expect, it } from "vitest";
import {
  buildTikTokVideoUrl,
  getPublicationViewUrl,
  isInstagramPostPermalink,
  isTikTokPostPermalink,
} from "../lib/platform-view-url.js";

describe("platform-view-url permalinks", () => {
  it("detects Instagram /p/ and /reel/ permalinks", () => {
    expect(
      isInstagramPostPermalink("https://www.instagram.com/p/AbCdEf123/"),
    ).toBe(true);
    expect(
      isInstagramPostPermalink("https://www.instagram.com/reel/AbCdEf123/"),
    ).toBe(true);
    expect(
      isInstagramPostPermalink("https://www.instagram.com/someuser/"),
    ).toBe(false);
  });

  it("detects TikTok video permalinks including handle-free", () => {
    expect(
      isTikTokPostPermalink(
        "https://www.tiktok.com/@creator/video/7123456789012345678",
      ),
    ).toBe(true);
    expect(
      isTikTokPostPermalink(
        "https://www.tiktok.com/@/video/7123456789012345678",
      ),
    ).toBe(true);
    expect(isTikTokPostPermalink("https://www.tiktok.com/@creator")).toBe(
      false,
    );
  });

  it("prefers stored Instagram permalink over profile", () => {
    const url = getPublicationViewUrl({
      platform: "instagram",
      status: "published",
      platformPostUrl: "https://www.instagram.com/p/AbCdEf123/",
      platformPostId: "17890000000000000",
      platformUsername: "creator",
    });
    expect(url).toBe("https://www.instagram.com/p/AbCdEf123/");
  });

  it("builds TikTok video URL from public video id when only profile was stored", () => {
    const url = getPublicationViewUrl({
      platform: "tiktok",
      status: "published",
      platformPostUrl: "https://www.tiktok.com/@creator",
      platformPostId: "7123456789012345678",
      platformUsername: "creator",
    });
    expect(url).toBe(
      buildTikTokVideoUrl("creator", "7123456789012345678"),
    );
  });

  it("builds handle-free TikTok video URL when @handle is unknown", () => {
    const url = getPublicationViewUrl({
      platform: "tiktok",
      status: "published",
      platformPostUrl: null,
      platformPostId: "7123456789012345678",
      platformUsername: "Display Name With Spaces",
    });
    expect(url).toBe(
      "https://www.tiktok.com/@/video/7123456789012345678",
    );
    expect(buildTikTokVideoUrl(null, "7123456789012345678")).toBe(
      "https://www.tiktok.com/@/video/7123456789012345678",
    );
  });

  it("does not invent TikTok video URL from non-numeric publish ids", () => {
    const url = getPublicationViewUrl({
      platform: "tiktok",
      status: "published",
      platformPostUrl: "https://www.tiktok.com/@creator",
      platformPostId: "v_pub_file~v2.1.123",
      platformUsername: "creator",
    });
    expect(url).toBe("https://www.tiktok.com/@creator");
  });

  it("prefers profile over bare tiktok.com homepage", () => {
    expect(
      getPublicationViewUrl({
        platform: "tiktok",
        status: "published",
        platformPostUrl: "https://www.tiktok.com/",
        platformPostId: null,
        platformUsername: "creator",
      }),
    ).toBe("https://www.tiktok.com/@creator");
  });

  it("uses first token of display name for TikTok profile View", () => {
    expect(
      getPublicationViewUrl({
        platform: "tiktok",
        status: "published",
        platformPostUrl: "https://www.tiktok.com/",
        platformPostId: null,
        platformUsername: "Display Name With Spaces",
      }),
    ).toBe("https://www.tiktok.com/@Display");
  });

  it("returns null only when there is no username and no video id", () => {
    expect(
      getPublicationViewUrl({
        platform: "tiktok",
        status: "published",
        platformPostUrl: null,
        platformPostId: null,
        platformUsername: null,
      }),
    ).toBeNull();
  });
});
