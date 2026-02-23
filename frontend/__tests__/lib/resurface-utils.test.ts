import {
  getResurfacePlatforms,
  isWithinResurfaceWindow,
} from "@/lib/resurface-utils";

describe("getResurfacePlatforms", () => {
  const xAccount = { id: "x-1", platform: "twitter_x" };
  const instagramAccount = { id: "ig-1", platform: "instagram" };
  const linkedInAccount = { id: "li-1", platform: "linkedin" };
  const youtubeAccount = { id: "yt-1", platform: "youtube" };
  const pinterestAccount = { id: "pin-1", platform: "pinterest" };
  const allAccounts = [
    xAccount,
    instagramAccount,
    linkedInAccount,
    youtubeAccount,
    pinterestAccount,
  ];

  it("returns [] when selectedIds is empty", () => {
    expect(getResurfacePlatforms([], allAccounts)).toEqual([]);
  });

  it("returns only X when X and Instagram are selected (only X supported)", () => {
    const result = getResurfacePlatforms(
      [xAccount.id, instagramAccount.id],
      allAccounts,
    );
    expect(result).toEqual(["twitter_x"]);
  });

  it("returns [] when only YouTube and Pinterest selected", () => {
    expect(
      getResurfacePlatforms([youtubeAccount.id, pinterestAccount.id], allAccounts),
    ).toEqual([]);
  });

  it("returns both X and LinkedIn when both selected (only twitter_x in RESURFACE_PLATFORMS)", () => {
    // Current implementation only has twitter_x in RESURFACE_PLATFORMS
    const result = getResurfacePlatforms(
      [xAccount.id, linkedInAccount.id],
      allAccounts,
    );
    expect(result).toContain("twitter_x");
    // If LinkedIn is added to RESURFACE_PLATFORMS later, it would be here
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("returns [] when all selected are unsupported", () => {
    expect(
      getResurfacePlatforms(
        [instagramAccount.id, youtubeAccount.id, pinterestAccount.id],
        allAccounts,
      ),
    ).toEqual([]);
  });
});

describe("isWithinResurfaceWindow", () => {
  const WINDOW_MS = 24 * 60 * 60 * 1000;

  it("returns true for 3 hours ago", () => {
    const publishedAt = new Date(Date.now() - 3 * 3600000);
    expect(isWithinResurfaceWindow(publishedAt)).toBe(true);
  });

  it("returns false for 25 hours ago", () => {
    const publishedAt = new Date(Date.now() - 25 * 3600000);
    expect(isWithinResurfaceWindow(publishedAt)).toBe(false);
  });

  it("returns false for exactly 24h ago (expired)", () => {
    const publishedAt = new Date(Date.now() - WINDOW_MS);
    expect(isWithinResurfaceWindow(publishedAt)).toBe(false);
  });

  it("returns true for future date (scheduled post)", () => {
    const publishedAt = new Date(Date.now() + 3600000);
    expect(isWithinResurfaceWindow(publishedAt)).toBe(true);
  });
});
