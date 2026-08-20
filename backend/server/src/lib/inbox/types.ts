/** Unified inbox - live fetch, no DB. */

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

export type InboxNotice = {
  platform: string;
  message: string;
};

export type InboxListResult = {
  range: DateWindowRange;
  since: string;
  until: string;
  threads: InboxThread[];
  accountsNeedingReconnect: InboxReconnectHint[];
  unsupported: string[];
  fetchErrors: InboxFetchError[];
  notices: InboxNotice[];
  fetchedAt: string;
  sampled: boolean;
  sampleLimit: number;
  hasMore: boolean;
  nextBefore: string | null;
};

export const INBOX_DM_PLATFORMS = [
  "instagram",
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

/** True when a Graph participant/sender is the connected Instagram account. */
export function isInboxSelfActor(
  actor: { id?: string | null; username?: string | null } | null | undefined,
  selfId: string,
  selfUsername?: string | null,
): boolean {
  if (!actor) return false;
  if (actor.id != null && String(actor.id) === String(selfId)) return true;
  return sameInboxHandle(actor.username, selfUsername);
}

export function peerFromParticipants(
  participants: Array<{
    id?: string;
    name?: string;
    username?: string;
    picture?: unknown;
  }>,
  selfId: string,
  selfUsername?: string | null,
): { id: string; name: string; handle: string | null; avatarUrl: string | null } {
  // Instagram Messaging participant ids often differ from /me id; also match username.
  const others = participants.filter(
    (p) => p.id && !isInboxSelfActor(p, selfId, selfUsername),
  );
  const peer = others[0] ?? {};
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

/** Instagram User Profile API returns `profile_pic` (not nested `picture`). */
export function instagramProfilePicUrl(data: unknown): string | null {
  const direct = (data as { profile_pic?: unknown })?.profile_pic;
  if (typeof direct === "string" && direct.startsWith("http")) return direct;
  return graphPictureUrl(direct);
}

export type InboxDmListResult = {
  range: DateWindowRange;
  since: string;
  until: string;
  threads: InboxDmThread[];
  accountsNeedingReconnect: InboxReconnectHint[];
  unsupported: string[];
  fetchErrors: InboxFetchError[];
  notices: InboxNotice[];
  fetchedAt: string;
  sampled: boolean;
  sampleLimit: number;
  hasMore: boolean;
  nextBefore: string | null;
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
  youtube: ["https://www.googleapis.com/auth/youtube.force-ssl"],
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
  twitter_x: [],
  bluesky: [],
  // Login Kit has no extra DM scope. Business Messaging is a separate product;
  // failures are fetch errors, not "reconnect to grant a scope".
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

/** Page-connected IG cannot grant messaging. Do not nag reconnect for that scope. */
export function instagramDmsNeedInstagramLogin(
  metadata: Record<string, unknown> | null | undefined,
  granted: string | null | undefined,
): boolean {
  const method = metadata?.connectionMethod;
  if (method === "facebook-page") return true;
  if (method === "direct") return false;
  const pageLike =
    inboxScopeGranted(granted, "pages_show_list") ||
    inboxScopeGranted(granted, "pages_manage_posts") ||
    inboxScopeGranted(granted, "pages_read_engagement");
  return (
    pageLike && !inboxScopeGranted(granted, "instagram_business_manage_messages")
  );
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

/** Person/org URN vs connected_accounts.platformUserId (bare id or full URN). */
export function sameLinkedInActor(
  actor: string | null | undefined,
  platformUserId: string | null | undefined,
): boolean {
  if (!actor || !platformUserId) return false;
  if (actor === platformUserId) return true;
  const a = actor.split(":").pop();
  const b = platformUserId.split(":").pop();
  return Boolean(a && b && a === b);
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

/** Latest createdAt in a thread (root + replies) for inbox sort order. */
function latestThreadActivity(
  root: InboxComment,
  replies: InboxComment[],
): string {
  const times = [root.createdAt, ...replies.map((r) => r.createdAt)].filter(
    Boolean,
  ) as string[];
  return times.sort().at(-1) ?? "";
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

  tops.sort((a, b) => {
    const aTs = latestThreadActivity(a, repliesByRoot.get(a.id) ?? []);
    const bTs = latestThreadActivity(b, repliesByRoot.get(b.id) ?? []);
    return bTs.localeCompare(aTs);
  });
  return tops.map((comment) => ({
    comment,
    replies: (repliesByRoot.get(comment.id) ?? []).sort((a, b) =>
      (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
    ),
  }));
}
