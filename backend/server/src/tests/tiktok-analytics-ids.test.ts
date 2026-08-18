import { describe, expect, it } from "vitest";
import {
  grantedScopesForConnect,
  scopeStringFromToken,
} from "../lib/oauth-granted-scopes.js";
import {
  firstTikTokPublicVideoId,
  isTikTokApiOk,
  isTikTokVideoId,
  parseTikTokJson,
  storedTikTokPostId,
  tiktokPublishIdFromStored,
} from "../lib/tiktok-post-id.js";

describe("oauth granted scopes", () => {
  it("reads comma or array token scopes", () => {
    expect(scopeStringFromToken({ scope: "a,b" })).toBe("a,b");
    expect(scopeStringFromToken({ scope: ["video.list", "video.publish"] })).toBe(
      "video.list,video.publish",
    );
    expect(scopeStringFromToken({ scope: "" })).toBeNull();
  });

  it("prefers TikTok token subset over requested fallback", () => {
    expect(
      grantedScopesForConnect("tiktok", {
        scope: "user.info.basic,video.publish,video.list",
      }),
    ).toBe("user.info.basic,video.publish,video.list");
  });

  it("falls back to requested Instagram scopes when the token omits scope", () => {
    const granted = grantedScopesForConnect("instagram", {});
    expect(granted).toContain("instagram_business_manage_insights");
    expect(granted).toContain("instagram_business_manage_comments");
  });
});

describe("tiktok post ids", () => {
  it("keeps 19-digit video ids as strings instead of rounding them", () => {
    const raw =
      '{"data":{"publicaly_available_post_id":[7123456789012345678],"status":"PUBLISH_COMPLETE"}}';
    const parsed = parseTikTokJson(raw) as {
      data: { publicaly_available_post_id: string[] };
    };
    expect(parsed.data.publicaly_available_post_id[0]).toBe("7123456789012345678");
    expect(firstTikTokPublicVideoId(parsed.data.publicaly_available_post_id)).toBe(
      "7123456789012345678",
    );
  });

  it("stores publish_id until a public video id exists", () => {
    expect(
      storedTikTokPostId({ publishId: "v_pub_file~v2.1", publicIds: [] }),
    ).toBe("ttpub:v_pub_file~v2.1");
    expect(tiktokPublishIdFromStored("ttpub:v_pub_file~v2.1")).toBe(
      "v_pub_file~v2.1",
    );
    expect(isTikTokVideoId("ttpub:v_pub_file~v2.1")).toBe(false);
    expect(isTikTokVideoId("7123456789012345678")).toBe(true);
  });

  it("treats TikTok error.code ok as success", () => {
    expect(isTikTokApiOk({ error: { code: "ok" } }, true)).toBe(true);
    expect(isTikTokApiOk({ error: { code: "scope_not_authorized" } }, true)).toBe(
      false,
    );
  });
});
