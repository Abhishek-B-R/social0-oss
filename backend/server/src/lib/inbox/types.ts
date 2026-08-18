/** Unified inbox — live fetch, no DB. */

import type { DateWindowRange } from "../date-window.js";

export type InboxAttachment = {
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string | null;
};

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
  postContent: string;
  postMediaUrl?: string | null;
  postPublishedAt?: string | null;
  postAccountImageUrl?: string | null;
  authorName: string;
  authorHandle: string | null;
  authorAvatarUrl?: string | null;
  text: string;
  attachment?: InboxAttachment | null;
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

export type InboxFetchError = {
  accountId: string;
  platform: string;
  error: string;
};

export type InboxListResult = {
  range: DateWindowRange;
  since: string;
  until: string;
  threads: InboxThread[];
  accountsNeedingReconnect: InboxReconnectHint[];
  unsupported: string[];
  fetchErrors: InboxFetchError[];
  fetchedAt: string;
  sampled: boolean;
  sampleLimit: number;
};

export const INBOX_DM_PLATFORMS = [
  "instagram",
  "facebook",
  "twitter_x",
  "bluesky",
  "tiktok",
] as const;

export type InboxDmPlatform = (typeof INBOX_DM_PLATFORMS)[number];

export type InboxDmThread = {
  conversationId: string;
  platform: string;
  accountId: string;
  accountLabel: string | null;
  accountProfileImageUrl?: string | null;
  peerId: string;
  peerName: string;
  peerHandle: string | null;
  peerAvatarUrl?: string | null;
  lastMessageAt: string | null;
  snippet: string;
  canReply: boolean;
  mediaKinds?: ("image" | "video")[];
};

export type InboxDmMessage = {
  id: string;
  text: string;
  createdAt: string | null;
  isOwn: boolean;
  authorName: string;
  authorHandle: string | null;
  authorAvatarUrl?: string | null;
  attachment?: InboxAttachment | null;
};

export function peerFromParticipants(
  participants: Array<{
    id?: string;
    name?: string;
    username?: string;
    picture?: unknown;
  }>,
  selfId: string,
): { id: string; name: string; handle: string | null; avatarUrl: string | null } {
  const others = participants.filter((p) => p.id && p.id !== selfId);
  const peer = others[0] ?? participants.find((p) => p.id) ?? {};
  return {
    id: peer.id ?? "",
    name: peer.name ?? peer.username ?? "Unknown",
    handle: peer.username ?? null,
    avatarUrl: graphPictureUrl(peer.picture),
  };
}

export function graphPictureUrl(picture: unknown): string | null {
  if (typeof picture === "string" && picture.startsWith("http")) return picture;
  if (picture && typeof picture === "object") {
    const url = (picture as { data?: { url?: string }; url?: string }).data?.url
      ?? (picture as { url?: string }).url;
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  return null;
}

export type InboxDmListResult = {
  range: DateWindowRange;
  since: string;
  until: string;
  threads: InboxDmThread[];
  accountsNeedingReconnect: InboxReconnectHint[];
  unsupported: string[];
  fetchErrors: InboxFetchError[];
  fetchedAt: string;
  sampled: boolean;
  sampleLimit: number;
};

export type InboxDmThreadResult = {
  conversationId: string;
  thread: InboxDmThread;
  messages: InboxDmMessage[];
  fetchedAt: string;
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

/** Extra scopes for DMs. Empty = current token is enough (app-level X / Bluesky app password). */
export const INBOX_DM_REQUIRED_SCOPES: Record<string, string[]> = {
  instagram: ["instagram_business_manage_messages"],
  facebook: ["pages_messaging"],
  twitter_x: [],
  bluesky: [],
  // Login Kit tokens have no extra scope string; Business Messaging is a
  // separate TikTok product. We try the API and surface a reconnect hint on fail.
  tiktok: [],
};

export function missingDmScopes(
  platform: string,
  granted: string | null | undefined,
): string[] {
  const needed = INBOX_DM_REQUIRED_SCOPES[platform] ?? [];
  if (needed.length === 0) return [];
  if (!granted?.trim()) return [...needed];
  return needed.filter((s) => !inboxScopeGranted(granted, s));
}

export function isInboxDmPlatform(platform: string): platform is InboxDmPlatform {
  return (INBOX_DM_PLATFORMS as readonly string[]).includes(platform);
}

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
