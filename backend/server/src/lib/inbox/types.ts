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
  likedByMe?: boolean;
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
  /** Platform sender id (Instagram IGSID). Used as Graph send recipient. */
  authorId?: string | null;
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
  selfIgsid?: string | null,
): boolean {
  if (!actor) return false;
  if (selfIgsid && actor.id != null && String(actor.id) === String(selfIgsid)) {
    return true;
  }
  if (actor.id != null && String(actor.id) === String(selfId)) return true;
  return sameInboxHandle(actor.username, selfUsername);
}

export type InstagramProfileHint = {
  name?: string | null;
  username?: string | null;
};

type InstagramActor = {
  id?: string | null;
  name?: string | null;
  username?: string | null;
};

/**
 * Instagram Messaging IGSID for the connected account. /me id is a different
 * identifier, so we match username on participants, fetched profiles, or
 * message `from` objects.
 */
export function instagramSelfIgsid(
  participants: InstagramActor[],
  selfId: string,
  selfUsername?: string | null,
  profiles?: Map<string, InstagramProfileHint> | null,
  messageFrom?: InstagramActor[] | null,
): string | null {
  if (selfId) {
    const byMe = participants.find((p) => p.id && String(p.id) === String(selfId));
    if (byMe?.id) return String(byMe.id);
  }
  const handleOf = (person: InstagramActor | undefined): string | null => {
    if (!person?.id) return null;
    if (sameInboxHandle(person.username, selfUsername)) return String(person.id);
    const profile = profiles?.get(String(person.id));
    if (sameInboxHandle(profile?.username, selfUsername)) return String(person.id);
    return null;
  };
  for (const person of participants) {
    const id = handleOf(person);
    if (id) return id;
  }
  for (const person of messageFrom ?? []) {
    const id = handleOf(person);
    if (id) return id;
  }
  return null;
}

function personToPeer(person: {
  id?: string;
  name?: string;
  username?: string;
  picture?: unknown;
}): { id: string; name: string; handle: string | null; avatarUrl: string | null } {
  return {
    id: person.id ?? "",
    name: person.name ?? person.username ?? "Unknown",
    handle: person.username ?? null,
    avatarUrl: graphPictureUrl(person.picture),
  };
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
  return instagramDmPeer(participants, selfId, selfUsername);
}

/**
 * Instagram participant ids often differ from /me. Pick the other person in
 * the 1:1 thread. Never use last `from` as the customer if that id is us
 * (Graph often omits username on our own messages).
 */
export function instagramDmPeer(
  participants: Array<{
    id?: string;
    name?: string;
    username?: string;
    picture?: unknown;
  }>,
  selfId: string,
  selfUsername?: string | null,
  lastFrom?: {
    id?: string | null;
    name?: string | null;
    username?: string | null;
  } | null,
  profiles?: Map<string, InstagramProfileHint> | null,
): { id: string; name: string; handle: string | null; avatarUrl: string | null } {
  const selfIgsid = instagramSelfIgsid(
    participants,
    selfId,
    selfUsername,
    profiles,
    lastFrom ? [lastFrom] : null,
  );
  const isSelf = (
    person: { id?: string | null; username?: string | null } | null | undefined,
  ) => isInboxSelfActor(person, selfId, selfUsername, selfIgsid);

  const enrich = (person: {
    id?: string;
    name?: string;
    username?: string;
    picture?: unknown;
  }) => {
    const profile = person.id ? profiles?.get(String(person.id)) : undefined;
    return personToPeer({
      ...person,
      name: person.name ?? profile?.name ?? undefined,
      username: person.username ?? profile?.username ?? undefined,
    });
  };

  if (selfIgsid) {
    const other = participants.find(
      (p) => p.id && String(p.id) !== String(selfIgsid),
    );
    if (other?.id) return enrich(other);
  }

  const fromId = lastFrom?.id != null ? String(lastFrom.id) : "";
  const fromActor = fromId
    ? { id: fromId, username: lastFrom?.username }
    : null;
  const fromLooksIdentified = Boolean(
    lastFrom?.username || (fromId && profiles?.get(fromId)?.username),
  );
  if (fromId && !isSelf(fromActor) && (fromLooksIdentified || selfIgsid)) {
    const listed = participants.find((p) => p.id && String(p.id) === fromId);
    return enrich({
      id: fromId,
      name: listed?.name ?? lastFrom?.name ?? undefined,
      username: listed?.username ?? lastFrom?.username ?? undefined,
      picture: listed?.picture,
    });
  }

  if (fromId && isSelf(fromActor)) {
    const other = participants.find((p) => p.id && String(p.id) !== fromId);
    if (other?.id) return enrich(other);
  }

  const namedOthers = participants.filter(
    (p) =>
      p.id &&
      !isSelf(p) &&
      (p.username || profiles?.get(String(p.id))?.username),
  );
  if (namedOthers.length === 1 && namedOthers[0]) return enrich(namedOthers[0]);

  const others = participants.filter((p) => p.id && !isSelf(p));
  if (others.length === 1 && others[0]) return enrich(others[0]);

  return personToPeer({});
}

/** Instagram Messaging API reply window (Human Agent extends to 7 days — not enabled). */
export const INSTAGRAM_DM_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when the customer messaged within Meta's standard DM reply window. */
export function instagramDmWithinReplyWindow(
  messages: Array<{ isOwn: boolean; createdAt?: string | null }>,
): boolean {
  const inbound = [...messages].reverse().find((m) => !m.isOwn);
  if (!inbound?.createdAt) return false;
  const t = Date.parse(inbound.createdAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < INSTAGRAM_DM_REPLY_WINDOW_MS;
}

/**
 * Resolve the Instagram-scoped id Graph expects on send. Prefer the latest
 * inbound message author — that is always the customer IGSID inside the
 * 24-hour window. Fall back to thread/list peer resolution.
 */
export function instagramDmSendRecipient(
  messages: Array<{ isOwn: boolean; authorId?: string | null }>,
  opts: {
    threadPeerId?: string | null;
    fallbackPeerId?: string | null;
    selfId: string;
    selfUsername?: string | null;
    selfIgsid?: string | null;
  },
): string | null {
  const inbound = [...messages].reverse().find((m) => !m.isOwn && m.authorId);
  const candidates = [
    inbound?.authorId,
    opts.threadPeerId,
    opts.fallbackPeerId,
  ].filter((id): id is string => Boolean(id?.trim()));
  for (const id of candidates) {
    if (
      !isInboxSelfActor({ id }, opts.selfId, opts.selfUsername, opts.selfIgsid)
    ) {
      return id;
    }
  }
  return null;
}

/** Placeholder peer labels that should lose to richer list/thread data. */
export const WEAK_DM_PEER_NAMES = new Set([
  "Unknown",
  "X user",
  "Bluesky user",
  "Conversation",
  "TikTok user",
]);

export function isWeakDmPeerName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true;
  return WEAK_DM_PEER_NAMES.has(name.trim());
}

/** Prefer non-placeholder name/handle/avatar when merging list + thread identity. */
export function mergeDmThreadIdentity(
  preferred: InboxDmThread,
  fallback?: InboxDmThread | null,
): InboxDmThread {
  if (!fallback) return preferred;
  const useFallbackName =
    isWeakDmPeerName(preferred.peerName) && !isWeakDmPeerName(fallback.peerName);
  const useFallbackHandle =
    !preferred.peerHandle?.trim() && Boolean(fallback.peerHandle?.trim());
  const useFallbackAvatar =
    !preferred.peerAvatarUrl?.trim() && Boolean(fallback.peerAvatarUrl?.trim());
  const useFallbackPeerId = !preferred.peerId && Boolean(fallback.peerId);
  return {
    ...fallback,
    ...preferred,
    peerId: useFallbackPeerId ? fallback.peerId : preferred.peerId || fallback.peerId,
    peerName: useFallbackName ? fallback.peerName : preferred.peerName,
    peerHandle: useFallbackHandle ? fallback.peerHandle : preferred.peerHandle,
    peerAvatarUrl: useFallbackAvatar
      ? fallback.peerAvatarUrl
      : preferred.peerAvatarUrl ?? fallback.peerAvatarUrl,
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
  // Unknown stored scopes — live fetch decides reconnect (avoid stale nag).
  if (!granted?.trim()) return [];
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
  const need = normalizeOAuthScope(needed);
  return granted
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .some((p) => {
      const got = normalizeOAuthScope(p);
      // Exact match, or Google short name vs full auth URL (normalized).
      return got === need || p === needed;
    });
}

/** Strip Google auth URL prefix so stored short names still match. */
export function normalizeOAuthScope(scope: string): string {
  return scope
    .trim()
    .replace(/^https:\/\/www\.googleapis\.com\/auth\//i, "")
    .toLowerCase();
}

/**
 * Reconnect hints from a live fetch - only when the platform reported a scope
 * problem. Do not fall back to DB scope strings after a successful read (stale
 * `connected_accounts.scopes` would nag forever even when comments work).
 */
export function reconnectScopesFromFetch(result: {
  status?: string;
  missingScopes?: string[];
}): string[] {
  if (result.missingScopes?.length) return [...result.missingScopes];
  return [];
}

export function missingInboxScopes(
  platform: string,
  granted: string | null | undefined,
): string[] {
  const needed = INBOX_REQUIRED_SCOPES[platform] ?? [];
  if (needed.length === 0) return [];
  // Unknown stored scopes — live fetch decides reconnect (avoid stale nag).
  if (!granted?.trim()) return [];
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
