import { describe, expect, it } from "vitest";
import {
  dmConversationInList,
  findDmConversationInList,
} from "../lib/inbox/verify-dm.js";

describe("verifyDmConversationOnAccount helpers", () => {
  it("matches conversation ids in a thread list", () => {
    const threads = [
      { conversationId: "t1", peerId: "p1" },
      { conversationId: "t2", peerId: "p2" },
    ];
    expect(dmConversationInList(threads, "t2")).toBe(true);
    expect(dmConversationInList(threads, "missing")).toBe(false);
  });

  it("returns the verified peer id for a conversation", () => {
    const threads = [
      { conversationId: "t1", peerId: "peer-one" },
      { conversationId: "t2", peerId: "peer-two" },
    ];
    expect(findDmConversationInList(threads, "t2")).toEqual({
      peerId: "peer-two",
    });
    expect(findDmConversationInList(threads, "missing")).toBeNull();
  });
});
