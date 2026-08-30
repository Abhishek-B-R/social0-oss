import { describe, expect, it } from "vitest";
import { peerIdFromXConversation } from "../lib/inbox/fetch-dms.js";
import {
  chunkXConversations,
  type CommentFetchInput,
} from "../lib/inbox/fetch-comments.js";

function input(id: string): CommentFetchInput {
  return {
    platform: "twitter_x",
    platformPostId: id,
    platformPostUrl: null,
    platformUserId: "u1",
    accessToken: "t",
    accessSecret: "s",
    accountId: "a1",
    accountLabel: "handle",
    postId: `post-${id}`,
    publicationId: `pub-${id}`,
    postSnippet: "snippet",
    postContent: "content",
  };
}

describe("peerIdFromXConversation", () => {
  it("extracts the other user from a 1:1 conversation id", () => {
    expect(peerIdFromXConversation("100-200", "100")).toBe("200");
    expect(peerIdFromXConversation("100-200", "200")).toBe("100");
  });

  it("ignores non 1:1 conversation ids", () => {
    expect(peerIdFromXConversation("group-abc", "100")).toBe("");
    expect(peerIdFromXConversation("100", "100")).toBe("");
  });
});

describe("chunkXConversations", () => {
  it("packs many conversations into one query chunk", () => {
    // 19-digit tweet ids: conversation_id:<id> = 35 chars, + " OR " joins.
    const inputs = Array.from({ length: 12 }, (_, i) =>
      input(`186133421859554713${i}`),
    );
    const chunks = chunkXConversations(inputs);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(12);
  });

  it("splits when the OR query would exceed the Recent Search limit", () => {
    const inputs = Array.from({ length: 30 }, (_, i) =>
      input(`18613342185955471${String(i).padStart(2, "0")}`),
    );
    const chunks = chunkXConversations(inputs);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const query = chunk
        .map((c) => `conversation_id:${c.platformPostId}`)
        .join(" OR ");
      expect(query.length).toBeLessThanOrEqual(512);
    }
    expect(chunks.flat()).toHaveLength(30);
  });

  it("keeps every conversation exactly once and in order", () => {
    const inputs = Array.from({ length: 20 }, (_, i) => input(`id-${i}`));
    const chunks = chunkXConversations(inputs);
    expect(chunks.flat().map((c) => c.platformPostId)).toEqual(
      inputs.map((c) => c.platformPostId),
    );
  });
});
