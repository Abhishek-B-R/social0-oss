import { describe, expect, it } from "vitest";
import { dmConversationInList } from "../lib/inbox/verify-dm.js";

describe("verifyDmConversationOnAccount helpers", () => {
  it("matches conversation ids in a thread list", () => {
    const threads = [
      { conversationId: "t1" },
      { conversationId: "t2" },
    ];
    expect(dmConversationInList(threads, "t2")).toBe(true);
    expect(dmConversationInList(threads, "missing")).toBe(false);
  });
});
