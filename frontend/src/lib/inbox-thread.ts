export type InboxThreadNode = {
  id: string;
  parentId: string | null;
  createdAt?: string | null;
  text?: string;
  authorHandle?: string | null;
  authorName?: string;
};

const MAX_DEPTH = 4;

function leadingMention(text: string): string | null {
  const m = text.trim().match(/^@([A-Za-z0-9._-]+)/);
  return m?.[1] ?? null;
}

function handleKey(value: string | null | undefined): string {
  return (value ?? "").replace(/^@/, "").trim().toLowerCase();
}

function matchesHandle(
  comment: { authorHandle?: string | null; authorName?: string },
  mention: string,
): boolean {
  const key = mention.toLowerCase();
  return (
    handleKey(comment.authorHandle) === key || handleKey(comment.authorName) === key
  );
}

function nestByMention<T extends InboxThreadNode>(root: T, replies: T[]): T[] {
  const chrono = [...replies].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  const seen: T[] = [root];
  return chrono.map((reply) => {
    const mention = leadingMention(reply.text ?? "");
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

export function flattenInboxThread<T extends InboxThreadNode>(
  root: T,
  replies: T[],
): Array<{ comment: T; depth: number }> {
  const nested = replies.some((r) => r.parentId && r.parentId !== root.id)
    ? replies
    : nestByMention(root, replies);
  const sorted = [...nested].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  const out: Array<{ comment: T; depth: number }> = [{ comment: root, depth: 0 }];
  const nodes = new Map<string, { comment: T; children: T[] }>();
  for (const c of sorted) nodes.set(c.id, { comment: c, children: [] });

  const tops: T[] = [];
  for (const c of sorted) {
    const parentId = c.parentId;
    if (parentId && parentId !== root.id && nodes.has(parentId)) {
      nodes.get(parentId)!.children.push(c);
    } else {
      tops.push(c);
    }
  }

  function walk(list: T[], depth: number) {
    const nextDepth = Math.min(depth, MAX_DEPTH);
    for (const c of list) {
      out.push({ comment: c, depth: nextDepth });
      const kids = nodes.get(c.id)?.children ?? [];
      if (kids.length) walk(kids, nextDepth + 1);
    }
  }
  walk(tops, 1);
  return out;
}

export type InboxCommentTree<T> = {
  comment: T;
  children: InboxCommentTree<T>[];
};

/** Rebuild a tree from flattenInboxThread output (depth-contiguous). */
export function treeFromFlatInbox<T>(
  flat: Array<{ comment: T; depth: number }>,
): InboxCommentTree<T>[] {
  const roots: InboxCommentTree<T>[] = [];
  const stack: InboxCommentTree<T>[] = [];
  for (const { comment, depth } of flat) {
    const node: InboxCommentTree<T> = { comment, children: [] };
    stack.length = depth;
    if (depth <= 0) {
      roots.push(node);
    } else {
      stack[depth - 1]?.children.push(node);
    }
    stack[depth] = node;
  }
  return roots;
}
