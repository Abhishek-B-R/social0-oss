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

  it("detects TikTok video permalinks", () => {
    expect(
      isTikTokPostPermalink(
        "https://www.tiktok.com/@creator/video/7123456789012345678",
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

  it("still shows View for TikTok site/messages fallback URLs", () => {
    expect(
      getPublicationViewUrl({
        platform: "tiktok",
        status: "published",
        platformPostUrl: "https://www.tiktok.com",
        platformPostId: null,
        platformUsername: "Display Name With Spaces",
      }),
    ).toBe("https://www.tiktok.com");

    expect(
      getPublicationViewUrl({
        platform: "tiktok",
        status: "published",
        platformPostUrl: "https://www.tiktok.com/messages?lang=en",
        platformPostId: null,
        platformUsername: null,
      }),
    ).toBe("https://www.tiktok.com/messages?lang=en");
  });

  it("never leaves published TikTok View blank when URL was never stored", () => {
    expect(
      getPublicationViewUrl({
        platform: "tiktok",
        status: "published",
        platformPostUrl: null,
        platformPostId: null,
        platformUsername: "Display Name With Spaces",
      }),
    ).toBe("https://www.tiktok.com");
  });
});
