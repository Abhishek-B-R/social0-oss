import {
  isLikelyTikTokOpenId,
  parseTikTokTokenResponse,
  tiktokTokenHasBasicScope,
} from "@/lib/tiktok-connect";

describe("tiktok-connect", () => {
  it("parses nested token response", () => {
    const parsed = parseTikTokTokenResponse({
      data: {
        access_token: "tok",
        refresh_token: "ref",
        expires_in: 3600,
        open_id: "ea9c99a3-2c62-4048-bd92-a2e4f8d5ec44",
        scope: "user.info.basic,video.upload,video.publish",
      },
    });
    expect(parsed?.access_token).toBe("tok");
    expect(parsed?.open_id).toBe("ea9c99a3-2c62-4048-bd92-a2e4f8d5ec44");
    expect(tiktokTokenHasBasicScope(parsed?.scope ?? null)).toBe(true);
  });

  it("rejects placeholder platform user ids", () => {
    expect(isLikelyTikTokOpenId("ea9c99a3-2c62-4048-bd92-a2e4f8d5ec44")).toBe(
      true,
    );
    expect(isLikelyTikTokOpenId("tiktok-1234567890")).toBe(false);
    expect(isLikelyTikTokOpenId("unknown-123")).toBe(false);
  });

  it("detects missing basic scope on token", () => {
    expect(
      tiktokTokenHasBasicScope("video.upload,video.publish"),
    ).toBe(false);
  });
});
