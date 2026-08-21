import { describe, expect, it } from "vitest";
import {
  normalizeInstagramTokenResponse,
  parseInstagramMeResponse,
  unwrapInstagramDataPayload,
} from "../lib/instagram-oauth.js";

describe("unwrapInstagramDataPayload", () => {
  it("unwraps Meta data-array token payloads", () => {
    expect(
      unwrapInstagramDataPayload({
        data: [
          {
            access_token: "tok",
            user_id: "123",
            permissions: "instagram_business_basic",
          },
        ],
      }),
    ).toMatchObject({
      access_token: "tok",
      user_id: "123",
      permissions: "instagram_business_basic",
    });
  });

  it("keeps flat payloads", () => {
    expect(
      unwrapInstagramDataPayload({
        access_token: "tok",
        user_id: "123",
      }),
    ).toMatchObject({ access_token: "tok", user_id: "123" });
  });
});

describe("normalizeInstagramTokenResponse", () => {
  it("normalizes wrapped short-lived tokens", () => {
    expect(
      normalizeInstagramTokenResponse({
        data: [{ access_token: "short", user_id: 99 }],
      }),
    ).toEqual({
      access_token: "short",
      user_id: "99",
    });
  });

  it("rejects incomplete payloads", () => {
    expect(normalizeInstagramTokenResponse({ data: [{ access_token: "x" }] })).toBeNull();
    expect(normalizeInstagramTokenResponse({})).toBeNull();
  });
});

describe("parseInstagramMeResponse", () => {
  it("prefers user_id over id and reads username from wrapped me", () => {
    expect(
      parseInstagramMeResponse({
        data: [
          {
            id: "app-scoped",
            user_id: "17841405822304914",
            username: "milo__explores",
            profile_picture_url: "https://cdn.example/p.jpg",
          },
        ],
      }),
    ).toEqual({
      id: "17841405822304914",
      username: "milo__explores",
      profileImageUrl: "https://cdn.example/p.jpg",
    });
  });

  it("supports flat me responses", () => {
    expect(
      parseInstagramMeResponse({
        id: "1784",
        username: "creator",
      }),
    ).toEqual({
      id: "1784",
      username: "creator",
      profileImageUrl: null,
    });
  });

  it("returns null without an id", () => {
    expect(parseInstagramMeResponse({ username: "x" })).toBeNull();
  });
});
