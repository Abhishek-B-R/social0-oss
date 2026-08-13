import { describe, expect, it } from "vitest";
import { parseTikTokTokenResponse } from "../lib/tiktok-connect.js";

describe("parseTikTokTokenResponse", () => {
  it("parses flat TikTok refresh responses (current API shape)", () => {
    const parsed = parseTikTokTokenResponse({
      access_token: "act",
      refresh_token: "rft",
      expires_in: 86400,
      open_id: "abc",
    });
    expect(parsed).toEqual({
      access_token: "act",
      refresh_token: "rft",
      expires_in: 86400,
      open_id: "abc",
      scope: null,
    });
  });

  it("parses nested data.* responses", () => {
    const parsed = parseTikTokTokenResponse({
      data: {
        access_token: "act2",
        refresh_token: "rft2",
        expires_in: 3600,
      },
    });
    expect(parsed?.access_token).toBe("act2");
    expect(parsed?.refresh_token).toBe("rft2");
    expect(parsed?.expires_in).toBe(3600);
  });

  it("returns null when access_token missing", () => {
    expect(parseTikTokTokenResponse({ data: { refresh_token: "x" } })).toBeNull();
    expect(parseTikTokTokenResponse(null)).toBeNull();
  });
});
