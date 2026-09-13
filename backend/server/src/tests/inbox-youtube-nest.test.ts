import { describe, expect, it } from "vitest";
import { nestMentionReplies } from "../lib/inbox/mention-nest.js";
import type { InboxComment } from "../lib/inbox/types.js";

function comment(
  partial: Partial<InboxComment> & Pick<InboxComment, "id">,
): InboxComment {
  return {
    platform: "youtube",
    accountId: "acc",
    accountLabel: "me",
    postId: "post",
    publicationId: "pub",
    platformPostId: "video",
    platformPostUrl: null,
    postSnippet: "hello",
    postContent: "hello",
    authorName: "Ada",
    authorHandle: "ada",
    text: "hi",
    createdAt: "2026-01-02T00:00:00.000Z",
    parentId: null,
    canReply: true,
    ...partial,
  };
}

describe("nestMentionReplies", () => {
  it("nests a YouTube @mention under the matching earlier reply", () => {
    const root = comment({
      id: "root",
      authorHandle: "AbhishekB.R",
      authorName: "AbhishekB.R",
      text: "nice",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const nested = nestMentionReplies(root, [
      comment({
        id: "thanks",
        parentId: "root",
        authorHandle: "abhishekb.r9569",
        text: "thanks :)",
        createdAt: "2026-01-01T01:00:00.000Z",
      }),
      comment({
        id: "ok",
        parentId: "root",
        authorHandle: "AbhishekB.R",
        text: "@abhishekb.r9569 its ok :)",
        createdAt: "2026-01-01T02:00:00.000Z",
      }),
      comment({
        id: "hello",
        parentId: "root",
        authorHandle: "abhishekb.r9569",
        text: "hello??",
        createdAt: "2026-01-01T03:00:00.000Z",
      }),
    ]);
    expect(nested.map((c) => [c.id, c.parentId])).toEqual([
      ["thanks", "root"],
      ["ok", "thanks"],
      ["hello", "root"],
    ]);
  });

  it("keeps a mention of the root author as a direct reply", () => {
    const root = comment({
      id: "root",
      authorHandle: "AbhishekB.R",
      text: "nice",
    });
    const nested = nestMentionReplies(root, [
      comment({
        id: "salute",
        parentId: "root",
        text: "@AbhishekB.R salute",
      }),
    ]);
    expect(nested[0]?.parentId).toBe("root");
  });
});
