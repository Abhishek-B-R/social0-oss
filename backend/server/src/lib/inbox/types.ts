/** Unified comments inbox — live fetch, no DB. */

export const INBOX_RANGES = ["1d", "7d", "30d", "90d"] as const;
export type InboxRange = (typeof INBOX_RANGES)[number];

export function isInboxRange(v: unknown): v is InboxRange {
  return typeof v === "string" && (INBOX_RANGES as readonly string[]).includes(v);
}

export function inboxRangeToMs(range: InboxRange): number {
  switch (range) {
    case "1d":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "90d":
      return 90 * 24 * 60 * 60 * 1000;
  }
}

export type InboxComment = {
  id: string;
  platform: string;
  accountId: string;
  accountLabel: string | null;
  postId: string;
  publicationId: string;
  platformPostId: string;
  platformPostUrl: string | null;
  postSnippet: string;
  authorName: string;
  authorHandle: string | null;
  text: string;
  createdAt: string | null;
  likeCount?: number;
  parentId: string | null;
  canReply: boolean;
  /** True when the comment author is the connected Social0 account. */
  isOwn?: boolean;
};

export type InboxThread = {
  comment: InboxComment;
  replies: InboxComment[];
};

export type InboxReconnectHint = {
  accountId: string;
  platform: string;
  username: string | null;
  missingScopes: string[];
};

export type InboxListResult = {
  range: InboxRange;
  since: string;
  until: string;
  threads: InboxThread[];
  accountsNeedingReconnect: InboxReconnectHint[];
  unsupported: string[];
  fetchedAt: string;
  sampled: boolean;
  sampleLimit: number;
};

/** Extra scopes for reading/replying to comments. Empty = current token is enough. */
export const INBOX_REQUIRED_SCOPES: Record<string, string[]> = {
  instagram: ["instagram_business_manage_comments"],
  facebook: ["pages_manage_engagement"],
  youtube: [],
  threads: [],
  twitter_x: [],
  bluesky: [],
  linkedin: [],
  tiktok: [],
  pinterest: [],
};

export const INBOX_UNSUPPORTED = new Set(["tiktok", "pinterest"]);

export function inboxScopeGranted(
  granted: string | null | undefined,
  needed: string,
): boolean {
  if (!granted) return false;
  return granted
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .some((p) => p === needed || p.endsWith(needed));
}

export function missingInboxScopes(
  platform: string,
  granted: string | null | undefined,
): string[] {
  const needed = INBOX_REQUIRED_SCOPES[platform] ?? [];
  if (needed.length === 0) return [];
  if (!granted?.trim()) return [...needed];
  return needed.filter((s) => !inboxScopeGranted(granted, s));
}

export function sameInboxHandle(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    a.replace(/^@/, "").trim().toLowerCase() ===
    b.replace(/^@/, "").trim().toLowerCase()
  );
}

/** YouTube comment snippets expose `{ value: channelId }`, not a bare string. */
export function youtubeAuthorChannelId(v: unknown): string | null {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object" && typeof (v as { value?: unknown }).value === "string") {
    const id = (v as { value: string }).value;
    return id || null;
  }
  return null;
}

/**
 * Nest replies under the top-level comment in the conversation.
 * Deeper replies (reply-to-reply) flatten under that root so the pane shows
 * the full back-and-forth. Orphans stay top-level.
 */
export function toInboxThreads(comments: InboxComment[]): InboxThread[] {
  const byId = new Map<string, InboxComment>();
  for (const c of comments) {
    if (c.id) byId.set(c.id, c);
  }

  function findRoot(c: InboxComment): InboxComment {
    let cur = c;
    const seen = new Set<string>();
    while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.parentId)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId)!;
    }
    return cur;
  }

  const repliesByRoot = new Map<string, InboxComment[]>();
  const tops: InboxComment[] = [];
  const topIds = new Set<string>();

  for (const c of byId.values()) {
    const root = findRoot(c);
    if (root.id === c.id) {
      if (!topIds.has(c.id)) {
        tops.push(c);
        topIds.add(c.id);
      }
      continue;
    }
    const list = repliesByRoot.get(root.id) ?? [];
    list.push(c);
    repliesByRoot.set(root.id, list);
  }

  tops.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return tops.map((comment) => ({
    comment,
    replies: (repliesByRoot.get(comment.id) ?? []).sort((a, b) =>
      (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
    ),
  }));
}
