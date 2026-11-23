/**
 * Unified inbox model: one list of comment threads and DM conversations.
 *
 * The API returns comments and DMs from two separate live reads; this file
 * turns both into `InboxItem`s that sort, filter and select the same way.
 */
import type {
  InboxAccount,
  InboxComment,
  InboxDmThread,
  InboxThread,
} from "@/api/inbox";

/** `?status=` on the Inbox page. Default (no param) is Needs reply. */
export type InboxStatusView = "needs_reply" | "done" | "all";
/** `?type=` on the Inbox page. No param = comments and DMs. */
export type InboxTypeFilter = "all" | "comments" | "dms";

export function parseStatusView(raw: string | null): InboxStatusView {
  if (raw === "done" || raw === "all") return raw;
  // Old links used the comment filter names.
  if (raw === "answered" || raw === "replied") return "done";
  return "needs_reply";
}

export function parseTypeFilter(
  raw: string | null,
  legacyTab: string | null,
): InboxTypeFilter {
  if (raw === "comments" || raw === "dms") return raw;
  // Old `?tab=dms` deep links open the DM view.
  if (!raw && legacyTab === "dms") return "dms";
  return "all";
}

type ItemBase = {
  /** Stable id, also written to `?item=`. */
  key: string;
  platform: string;
  accountId: string;
  accountLabel: string | null;
  /** Latest inbound activity (ISO); sorts the list and drives "needs reply". */
  at: string;
};

export type CommentItem = ItemBase & {
  kind: "comment";
  publicationId: string;
  thread: InboxThread;
  /** Newest comment in the thread that wasn't written by you. */
  latest: InboxComment;
  /**
   * An own reply (server or sent from here) is at least as new as `latest`.
   * A newer inbound comment after your reply needs a reply again.
   */
  answered: boolean;
};

/**
 * The DM list doesn't say who sent the last message yet. If the API starts
 * returning `lastMessageIsOwn`, conversations you answered elsewhere leave
 * Needs reply without being opened first.
 */
type DmThreadWithOwnFlag = InboxDmThread & { lastMessageIsOwn?: boolean };

export type DmItem = ItemBase & {
  kind: "dm";
  dm: InboxDmThread;
};

export type InboxItem = CommentItem | DmItem;

export function commentItemKey(thread: InboxThread): string {
  return `c:${thread.comment.publicationId}:${thread.comment.id}`;
}

export function dmItemKey(dm: Pick<InboxDmThread, "accountId" | "conversationId">): string {
  return `d:${dm.accountId}:${dm.conversationId}`;
}

function handleOf(raw: string | null | undefined): string {
  return (raw ?? "").replace(/^@/, "").trim();
}

/** "@yourbrand" or null. */
export function atHandle(raw: string | null | undefined): string | null {
  const h = handleOf(raw);
  return h ? `@${h}` : null;
}

/**
 * Epoch ms of a comment, or NaN. Parse instead of comparing strings:
 * Facebook sends `+0000` offsets and X sends `.000Z`.
 */
function commentTime(c: InboxComment): number {
  return c.createdAt ? Date.parse(c.createdAt) : NaN;
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

/** Comments in the thread written by someone else, minus ones you hid here. */
export function visibleInbound(
  thread: InboxThread,
  hiddenIds: ReadonlySet<string> = EMPTY_IDS,
): InboxComment[] {
  return [thread.comment, ...thread.replies].filter((c) => !c.isOwn && !hiddenIds.has(c.id));
}

function latestInbound(thread: InboxThread, hiddenIds: ReadonlySet<string>): InboxComment {
  const inbound = visibleInbound(thread, hiddenIds);
  if (!inbound.length) return thread.comment;
  return inbound.reduce((a, b) => {
    const ta = commentTime(a);
    const tb = commentTime(b);
    if (Number.isNaN(tb)) return a;
    if (Number.isNaN(ta)) return b;
    return tb > ta ? b : a;
  });
}

/**
 * Comment threads worth showing: someone other than you wrote in them.
 * A thread that is only your own root post with no outside replies is noise.
 */
export function isInboundThread(thread: InboxThread): boolean {
  if (!thread.comment.isOwn) return true;
  return thread.replies.some((r) => !r.isOwn);
}

/**
 * `hiddenIds` are comments you hid here (Hide, before the server drops them):
 * they no longer count as the latest inbound comment, so hiding a follow-up
 * doesn't keep the thread in Needs reply or preview the hidden text.
 */
export function buildCommentItem(
  thread: InboxThread,
  failedReplyIds: ReadonlySet<string>,
  hiddenIds: ReadonlySet<string> = EMPTY_IDS,
): CommentItem {
  const latest = latestInbound(thread, hiddenIds);
  // Answered only while your newest reply is at least as new as the newest
  // inbound comment: the backend folds every nested reply into one root
  // thread, so a follow-up after your reply lands here and needs a reply.
  // A reply that failed to send is not an answer. Optimistic replies carry
  // `createdAt = now`, so they count right away.
  const latestAt = commentTime(latest);
  const answered = thread.replies.some((r) => {
    if (!r.isOwn || failedReplyIds.has(r.id)) return false;
    const ownAt = commentTime(r);
    // Without both timestamps there is nothing to order: trust the reply.
    if (Number.isNaN(ownAt) || Number.isNaN(latestAt)) return true;
    return ownAt >= latestAt;
  });
  return {
    kind: "comment",
    key: commentItemKey(thread),
    platform: thread.comment.platform,
    accountId: thread.comment.accountId,
    accountLabel: thread.comment.accountLabel,
    at: latest.createdAt ?? thread.comment.createdAt ?? "",
    publicationId: thread.comment.publicationId,
    thread,
    latest,
    answered,
  };
}

export function buildDmItem(dm: InboxDmThread): DmItem {
  return {
    kind: "dm",
    key: dmItemKey(dm),
    platform: dm.platform,
    accountId: dm.accountId,
    accountLabel: dm.accountLabel,
    at: dm.lastMessageAt ?? "",
    dm,
  };
}

export function sortItems(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * `handled` maps item key → the activity time you dealt with it (replied
 * to a DM, or pressed Mark done). Newer activity brings it back.
 */
export function isHandledLocally(
  item: InboxItem,
  handled: Readonly<Record<string, string>>,
): boolean {
  const through = handled[item.key];
  if (!through) return false;
  if (!item.at) return true;
  // Compare as times: networks send `+0000` offsets or `.000Z`, so string
  // order is wrong when the mark and the activity are the same instant.
  const throughMs = Date.parse(through);
  const atMs = Date.parse(item.at);
  if (Number.isFinite(throughMs) && Number.isFinite(atMs)) return throughMs >= atMs;
  return through >= item.at;
}

export function itemNeedsReply(
  item: InboxItem,
  ctx: {
    handled: Readonly<Record<string, string>>;
    hiddenPublications: ReadonlySet<string>;
  },
): boolean {
  if (isHandledLocally(item, ctx.handled)) return false;
  if (item.kind === "comment") {
    if (item.answered) return false;
    if (ctx.hiddenPublications.has(item.publicationId)) return false;
  } else if ((item.dm as DmThreadWithOwnFlag).lastMessageIsOwn === true) {
    return false;
  }
  return true;
}

export function itemMatchesStatus(
  item: InboxItem,
  status: InboxStatusView,
  needsReply: boolean,
): boolean {
  if (status === "all") return true;
  return status === "needs_reply" ? needsReply : !needsReply;
}

/** Find the item a legacy `?thread=` (comment id) or `?convo=` link points at. */
export function legacyItemKey(
  items: InboxItem[],
  params: { thread: string | null; convo: string | null; account: string | null },
): string | null {
  if (params.thread) {
    const hit = items.find(
      (i) =>
        i.kind === "comment" &&
        (i.thread.comment.id === params.thread ||
          i.thread.replies.some((r) => r.id === params.thread)),
    );
    if (hit) return hit.key;
  }
  if (params.convo) {
    const account = params.account && params.account !== "all" ? params.account : null;
    const hit = items.find(
      (i) =>
        i.kind === "dm" &&
        i.dm.conversationId === params.convo &&
        (!account || i.accountId === account),
    );
    if (hit) return hit.key;
  }
  return null;
}

/** Account list for the filter: union of comment + DM accounts. */
export type InboxFilterAccount = InboxAccount & {
  comments: boolean;
  dms: boolean;
};

export function unionAccounts(
  commentAccounts: InboxAccount[],
  dmAccounts: InboxAccount[],
): InboxFilterAccount[] {
  const map = new Map<string, InboxFilterAccount>();
  for (const a of commentAccounts) {
    map.set(a.id, { ...a, comments: true, dms: false });
  }
  for (const a of dmAccounts) {
    const cur = map.get(a.id);
    if (cur) {
      cur.dms = true;
      if (a.missingScopes.length && !cur.missingScopes.length) {
        cur.missingScopes = a.missingScopes;
      }
    } else {
      map.set(a.id, { ...a, comments: false, dms: true });
    }
  }
  return [...map.values()];
}

/** One-line plain preview for a list row. */
export function itemPreview(item: InboxItem): string {
  if (item.kind === "dm") {
    const snippet = item.dm.snippet?.trim() ?? "";
    if (/^\[(image|photo)\]$/i.test(snippet)) return "Sent a photo";
    if (/^\[video\]$/i.test(snippet)) return "Sent a video";
    return snippet || "(No text)";
  }
  const text = item.latest.text?.trim();
  if (text) return text;
  if (item.latest.attachment?.type === "video") return "Sent a video";
  if (item.latest.attachment) return "Sent a photo";
  return "(No text)";
}

export function itemAuthor(item: InboxItem): {
  name: string;
  handle: string | null;
  avatarUrl: string | null;
} {
  if (item.kind === "dm") {
    return {
      name: item.dm.peerName,
      handle: item.dm.peerHandle,
      avatarUrl: item.dm.peerAvatarUrl ?? null,
    };
  }
  return {
    name: item.latest.authorName,
    handle: item.latest.authorHandle,
    avatarUrl: item.latest.authorAvatarUrl ?? null,
  };
}
