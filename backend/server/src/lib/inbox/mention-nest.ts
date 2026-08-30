/** YouTube (and similar) only parent replies to the top-level comment. */

export function leadingMention(text: string): string | null {
  const m = text.trim().match(/^@([A-Za-z0-9._-]+)/);
  return m?.[1] ?? null;
}

function handleKey(value: string | null | undefined): string {
  return (value ?? "").replace(/^@/, "").trim().toLowerCase();
}

function matchesHandle(
  comment: { authorHandle: string | null; authorName: string },
  mention: string,
): boolean {
  const key = mention.toLowerCase();
  return handleKey(comment.authorHandle) === key || handleKey(comment.authorName) === key;
}

export function nestMentionReplies<
  T extends {
    id: string;
    parentId: string | null;
    text: string;
    authorHandle: string | null;
    authorName: string;
    createdAt: string | null;
  },
>(root: T, replies: T[]): T[] {
  const chrono = [...replies].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  const seen: T[] = [root];
  return chrono.map((reply) => {
    const mention = leadingMention(reply.text);
    let parentId = root.id;
    if (mention) {
      for (let i = seen.length - 1; i >= 0; i--) {
        const prev = seen[i];
        if (prev && matchesHandle(prev, mention)) {
          parentId = prev.id;
          break;
        }
      }
    }
    const next = { ...reply, parentId };
    seen.push(next);
    return next;
  });
}
