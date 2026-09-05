import { describe, expect, it } from "vitest";
import {
  inboxPostGroupVisible,
  inboxThreadMatchesFilter,
  isInboxThreadAnswered,
  type InboxStatusThread,
} from "./inbox-comment-status";

function thread(id: string, answered: boolean): InboxStatusThread {
  return {
    comment: { id, parentId: null, isOwn: false },
    replies: answered ? [{ id: `${id}-r`, parentId: id, isOwn: true }] : [],
  };
}

describe("thread status", () => {
  it("counts an own reply as answered, not an own root", () => {
    expect(isInboxThreadAnswered(thread("a", true))).toBe(true);
    expect(isInboxThreadAnswered(thread("b", false))).toBe(false);
    expect(
      isInboxThreadAnswered({
        comment: { id: "c", parentId: null, isOwn: true },
        replies: [],
      }),
    ).toBe(false);
  });
});

describe("post group visibility", () => {
  const hidden = new Set<string>();

  it("keeps answered threads on a post that also has unanswered ones", () => {
    // The bug: a group-wide unanswered count dropped this whole post from the
    // Answered tab, so its answered thread was unreachable.
    const answeredOnly = [thread("a", true)].filter((t) =>
      inboxThreadMatchesFilter(t, "answered"),
    );
    expect(
      inboxPostGroupVisible(
        { publicationId: "pub-1", threads: answeredOnly },
        "answered",
        hidden,
      ),
    ).toBe(true);
  });

  it("drops a group whose threads all filtered out", () => {
    const none = [thread("a", true)].filter((t) =>
      inboxThreadMatchesFilter(t, "unanswered"),
    );
    expect(
      inboxPostGroupVisible({ publicationId: "pub-1", threads: none }, "unanswered", hidden),
    ).toBe(false);
  });

  it("honours hidden posts only on the unanswered tab", () => {
    const group = { publicationId: "pub-1", threads: [thread("a", false)] };
    const hiddenSet = new Set(["pub-1"]);
    expect(inboxPostGroupVisible(group, "unanswered", hiddenSet)).toBe(false);
    expect(inboxPostGroupVisible(group, "all", hiddenSet)).toBe(true);
    expect(inboxPostGroupVisible(group, "answered", hiddenSet)).toBe(true);
  });
});
