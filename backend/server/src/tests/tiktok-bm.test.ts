import { describe, expect, it } from "vitest";
import {
  isTikTokBmOk,
  isTikTokBmOwnMessage,
  tiktokBmConversations,
  tiktokBmCursor,
  tiktokBmErrorMessage,
  tiktokBmListFailed,
  tiktokBmSentMessageId,
} from "../lib/inbox/tiktok-bm.js";

describe("isTikTokBmOk", () => {
  it("requires HTTP success and code 0 (not a missing code)", () => {
    expect(isTikTokBmOk(true, { code: 0 })).toBe(true);
    expect(isTikTokBmOk(true, {})).toBe(false);
    expect(isTikTokBmOk(true, { code: 40100, message: "Access token is invalid" })).toBe(
      false,
    );
    expect(isTikTokBmOk(false, { code: 0 })).toBe(false);
  });
});

describe("tiktokBmConversations", () => {
  it("reads conversations or conversation_list", () => {
    expect(
      tiktokBmConversations({
        conversations: [{ conversation_id: "c1", update_time: 1 }],
      }),
    ).toEqual([{ conversation_id: "c1", update_time: 1 }]);
    expect(
      tiktokBmConversations({
        conversation_list: [{ conversation_id: "c2" }],
      }),
    ).toEqual([{ conversation_id: "c2" }]);
    expect(tiktokBmConversations({})).toEqual([]);
  });
});

describe("tiktokBmErrorMessage", () => {
  it("explains Login Kit tokens cannot call Business Messaging", () => {
    const msg = tiktokBmErrorMessage(
      { code: 40100, message: "Access token is invalid" },
      "TikTok DMs failed",
    );
    expect(msg).toContain("Access token is invalid");
    expect(msg).toContain("Business Messaging");
    expect(msg).not.toMatch(/^Business Messaging API$/);
  });
});

describe("tiktokBmListFailed", () => {
  it("errors only when every conversation type failed", () => {
    expect(
      tiktokBmListFailed({ anyOk: false, lastErr: "token invalid", rowCount: 0 }),
    ).toBe(true);
    expect(
      tiktokBmListFailed({ anyOk: true, lastErr: "stranger failed", rowCount: 0 }),
    ).toBe(false);
    expect(
      tiktokBmListFailed({ anyOk: false, lastErr: "token invalid", rowCount: 2 }),
    ).toBe(false);
  });
});

describe("tiktokBmCursor", () => {
  it("returns the next cursor only when has_more is set", () => {
    expect(tiktokBmCursor({ has_more: true, cursor: 99 })).toBe("99");
    expect(tiktokBmCursor({ has_more: false, cursor: 99 })).toBeNull();
  });
});

describe("isTikTokBmOwnMessage", () => {
  it("treats business role or matching id as own", () => {
    expect(
      isTikTokBmOwnMessage({ from_user: { role: "BUSINESS_ACCOUNT" } }, "biz"),
    ).toBe(true);
    expect(isTikTokBmOwnMessage({ sender: "biz" }, "biz")).toBe(true);
    expect(
      isTikTokBmOwnMessage({ from_user: { role: "PERSONAL_ACCOUNT", id: "u1" } }, "biz"),
    ).toBe(false);
  });
});

describe("tiktokBmSentMessageId", () => {
  it("reads nested or top-level message_id", () => {
    expect(tiktokBmSentMessageId({ message: { message_id: "m1" } })).toBe("m1");
    expect(tiktokBmSentMessageId({ message_id: "m2" })).toBe("m2");
  });
});
