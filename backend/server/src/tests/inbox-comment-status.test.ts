import { describe, expect, it } from "vitest";

/**
 * Mirrors frontend/src/lib/inbox-comment-status.ts so unread/answered
 * filtering stays testable next to the inbox fetchers.
 */
type Filter = "all" | "unread" | "unanswered" | "answered";
type Comment = { id: string; parentId?: string | null; isOwn?: boolean };
type Thread = { comment: Comment; replies: Comment[] };

function isUnread(
  comment: Comment,
  seen: { seeded: boolean; ids: ReadonlySet<string> },
): boolean {
  if (comment.isOwn) return false;
  if (!seen.seeded) return true;
  return !seen.ids.has(comment.id);
}

function isAnswered(thread: Thread): boolean {
  return Boolean(thread.comment.isOwn) || thread.replies.some((r) => r.isOwn);
}

function threadMatches(
  thread: Thread,
  filter: Filter,
  seen: { seeded: boolean; ids: ReadonlySet<string> },
): boolean {
  if (filter === "unanswered") return !isAnswered(thread);
  if (filter === "answered") return isAnswered(thread);
  if (filter === "unread") {
    return (
      isUnread(thread.comment, seen) ||
      thread.replies.some((r) => isUnread(r, seen))
    );
  }
  return true;
}

function visibleComments(
  flat: Array<{ comment: Comment; depth: number }>,
  filter: Filter,
  seen: { seeded: boolean; ids: ReadonlySet<string> },
): Array<{ comment: Comment; depth: number }> {
  if (filter !== "unread") return flat;
  const keep = new Set<string>();
  for (let i = 0; i < flat.length; i++) {
    const node = flat[i];
    if (!node || !isUnread(node.comment, seen)) continue;
    keep.add(node.comment.id);
    let depth = node.depth;
    for (let j = i - 1; j >= 0 && depth > 0; j--) {
      const prev = flat[j];
      if (!prev) continue;
      if (prev.depth === depth - 1) {
        keep.add(prev.comment.id);
        depth -= 1;
      }
    }
  }
  for (const node of flat) {
    if (
      node.comment.isOwn &&
      node.comment.parentId &&
      keep.has(node.comment.parentId)
    ) {
      keep.add(node.comment.id);
    }
  }
  return flat.filter((n) => keep.has(n.comment.id));
}

describe("comment status filters", () => {
  const seen = { seeded: true, ids: new Set(["read-1"]) };

  it("treats a Social0 reply as answered", () => {
    const unanswered: Thread = {
      comment: { id: "c1" },
      replies: [{ id: "c2" }],
    };
    const answered: Thread = {
      comment: { id: "c1" },
      replies: [{ id: "mine", isOwn: true }],
    };
    expect(threadMatches(unanswered, "unanswered", seen)).toBe(true);
    expect(threadMatches(answered, "unanswered", seen)).toBe(false);
    expect(threadMatches(answered, "answered", seen)).toBe(true);
  });

  it("unread ignores already-seen and own comments", () => {
    const thread: Thread = {
      comment: { id: "read-1" },
      replies: [
        { id: "new-2" },
        { id: "mine", isOwn: true, parentId: "new-2" },
      ],
    };
    expect(threadMatches(thread, "unread", seen)).toBe(true);
    expect(
      threadMatches(
        { comment: { id: "read-1" }, replies: [{ id: "mine", isOwn: true }] },
        "unread",
        seen,
      ),
    ).toBe(false);
  });

  it("conversation box keeps unread replies plus parent and our reply", () => {
    const flat = [
      { comment: { id: "read-1" }, depth: 0 },
      { comment: { id: "new-2", parentId: "read-1" }, depth: 1 },
      {
        comment: { id: "mine", isOwn: true, parentId: "new-2" },
        depth: 2,
      },
      { comment: { id: "old-3" }, depth: 0 },
    ];
    const visible = visibleComments(flat, "unread", seen);
    expect(visible.map((n) => n.comment.id)).toEqual([
      "read-1",
      "new-2",
      "mine",
    ]);
  });
});
