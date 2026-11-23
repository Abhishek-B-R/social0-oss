import { describe, expect, it } from "vitest";
import type { InboxComment, InboxThread } from "@/api/inbox";
import { buildCommentItem, buildDmItem, isHandledLocally, itemNeedsReply, itemPreview } from "./inbox-items";

function comment(
  id: string,
  createdAt: string | null,
  extra: Partial<InboxComment> = {},
): InboxComment {
  return {
    id,
    platform: "facebook",
    accountId: "acc-1",
    accountLabel: "brand",
    postId: "post-1",
    publicationId: "pub-1",
    platformPostId: "fb-post-1",
    platformPostUrl: null,
    postSnippet: "",
    postContent: "",
    authorName: extra.isOwn ? "You" : "Alice",
    authorHandle: null,
    text: id,
    createdAt,
    parentId: null,
    canReply: true,
    ...extra,
  };
}

const none = new Set<string>();
const ctx = { handled: {}, hiddenPublications: new Set<string>() };

function thread(...replies: InboxComment[]): InboxThread {
  return { comment: comment("root", "2026-10-01T10:00:00+0000"), replies };
}

describe("buildCommentItem answered", () => {
  it("counts an own reply after the latest inbound comment", () => {
    const item = buildCommentItem(
      thread(comment("own", "2026-10-01T11:00:00.000Z", { isOwn: true, parentId: "root" })),
      none,
    );
    expect(item.answered).toBe(true);
    expect(itemNeedsReply(item, ctx)).toBe(false);
  });

  it("needs a reply again when an inbound follow-up comes after your reply", () => {
    const item = buildCommentItem(
      thread(
        comment("own", "2026-10-01T11:00:00.000Z", { isOwn: true, parentId: "root" }),
        comment("follow-up", "2026-10-01T12:00:00+0000", { parentId: "own" }),
      ),
      none,
    );
    expect(item.latest.id).toBe("follow-up");
    expect(item.answered).toBe(false);
    expect(itemNeedsReply(item, ctx)).toBe(true);
  });

  it("orders mixed timestamp formats by time, not by string", () => {
    // "+0000" sorts before ".000Z" as a string at the same second.
    const item = buildCommentItem(
      thread(comment("own", "2026-10-01T10:00:00.000Z", { isOwn: true, parentId: "root" })),
      none,
    );
    expect(item.answered).toBe(true);
  });

  it("does not count a failed reply", () => {
    const item = buildCommentItem(
      thread(comment("optimistic-1", "2026-10-01T11:00:00.000Z", { isOwn: true, parentId: "root" })),
      new Set(["optimistic-1"]),
    );
    expect(item.answered).toBe(false);
  });

  it("is unanswered with no own reply", () => {
    expect(buildCommentItem(thread(), none).answered).toBe(false);
  });
});

describe("buildCommentItem with comments hidden here", () => {
  it("drops a hidden follow-up from latest, preview and needs-reply", () => {
    const t = thread(
      comment("own", "2026-10-01T11:00:00.000Z", { isOwn: true, parentId: "root" }),
      comment("spam", "2026-10-01T12:00:00+0000", { parentId: "own", authorName: "Spammer" }),
    );
    expect(itemNeedsReply(buildCommentItem(t, none), ctx)).toBe(true);
    const item = buildCommentItem(t, none, new Set(["spam"]));
    expect(item.latest.id).toBe("root");
    expect(item.at).toBe("2026-10-01T10:00:00+0000");
    expect(itemPreview(item)).toBe("root");
    expect(item.answered).toBe(true);
    expect(itemNeedsReply(item, ctx)).toBe(false);
  });
});

describe("isHandledLocally", () => {
  it("compares the mark and the activity as times, not strings", () => {
    // "+0000" sorts before ".000Z" as a string at the same instant.
    const item = buildDmItem({
      accountId: "acc-1",
      conversationId: "c-1",
      platform: "instagram",
      lastMessageAt: "2026-10-01T10:00:00+0000",
    } as Parameters<typeof buildDmItem>[0]);
    expect(isHandledLocally(item, { [item.key]: "2026-10-01T10:00:00.000Z" })).toBe(true);
    expect(isHandledLocally(item, { [item.key]: "2026-10-01T09:59:59.000Z" })).toBe(false);
  });
});
