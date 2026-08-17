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

/** Nest replies under parents. Orphans (parent missing from this fetch) stay top-level. */
export function toInboxThreads(comments: InboxComment[]): InboxThread[] {
  const byParent = new Map<string, InboxComment[]>();
  const top: InboxComment[] = [];
  for (const c of comments) {
    if (!c.id) continue;
    if (c.parentId) {
      const list = byParent.get(c.parentId) ?? [];
      list.push(c);
      byParent.set(c.parentId, list);
    } else {
      top.push(c);
    }
  }
  const topIds = new Set(top.map((c) => c.id));
  for (const [parentId, kids] of byParent) {
    if (topIds.has(parentId)) continue;
    top.push(...kids);
    byParent.delete(parentId);
  }
  top.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return top.map((comment) => ({
    comment,
    replies: (byParent.get(comment.id) ?? []).sort((a, b) =>
      (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
    ),
  }));
}
