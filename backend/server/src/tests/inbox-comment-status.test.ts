import { describe, expect, it } from "vitest";

/**
 * Mirrors frontend/src/lib/inbox-comment-status.ts so answered/unanswered
 * filtering stays testable next to the inbox fetchers.
 */
type Filter = "all" | "unanswered" | "answered";
type Comment = { id: string; parentId?: string | null; isOwn?: boolean };
type Thread = { comment: Comment; replies: Comment[] };

function isAnswered(thread: Thread): boolean {
  return thread.replies.some((r) => r.isOwn);
}

function threadMatches(thread: Thread, filter: Filter): boolean {
  if (filter === "unanswered") return !isAnswered(thread);
  if (filter === "answered") return isAnswered(thread);
  return true;
}

function visibleComments(
  flat: Array<{ comment: Comment; depth: number }>,
  filter: Filter,
): Array<{ comment: Comment; depth: number }> {
  if (filter === "all") return flat;
  const answered = flat.some((n) => n.comment.isOwn && n.depth > 0);
  if (filter === "answered") return answered ? flat : [];
  return answered ? [] : flat;
}

describe("comment status filters", () => {
  it("treats a Social0 reply as answered", () => {
    const unanswered: Thread = {
      comment: { id: "c1" },
      replies: [{ id: "c2" }],
    };
    const answered: Thread = {
      comment: { id: "c1" },
      replies: [{ id: "mine", isOwn: true }],
    };
    expect(threadMatches(unanswered, "unanswered")).toBe(true);
    expect(threadMatches(answered, "unanswered")).toBe(false);
    expect(threadMatches(answered, "answered")).toBe(true);
    expect(threadMatches(unanswered, "all")).toBe(true);
  });

  it("answered filter keeps whole threads, never partial ones", () => {
    const answeredFlat = [
      { comment: { id: "c1" }, depth: 0 },
      { comment: { id: "mine", isOwn: true, parentId: "c1" }, depth: 1 },
    ];
    const unansweredFlat = [{ comment: { id: "c1" }, depth: 0 }];

    expect(visibleComments(answeredFlat, "answered")).toEqual(answeredFlat);
    expect(visibleComments(answeredFlat, "unanswered")).toEqual([]);
    expect(visibleComments(unansweredFlat, "unanswered")).toEqual(
      unansweredFlat,
    );
    expect(visibleComments(unansweredFlat, "answered")).toEqual([]);
    expect(visibleComments(answeredFlat, "all")).toEqual(answeredFlat);
  });

  it("own root post does not count as an own reply", () => {
    const flat = [{ comment: { id: "root", isOwn: true }, depth: 0 }];
    expect(visibleComments(flat, "unanswered")).toEqual(flat);
  });

  it("own root thread with inbound replies stays unanswered until we reply", () => {
    const thread: Thread = {
      comment: { id: "root", isOwn: true },
      replies: [{ id: "them" }],
    };
    expect(threadMatches(thread, "unanswered")).toBe(true);
    expect(threadMatches(thread, "answered")).toBe(false);
  });
});
