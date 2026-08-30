/** Last-seen ids for the dashboard Inbox nav badge. First visit seeds, no historical flood. */

const KEY_PREFIX = "s0:inbox:seen-ids";
const MAX = 800;
const SEEN_EVENT = "s0-inbox-seen";

export type InboxSeenStore = {
  seeded: boolean;
  comments: string[];
  dms: string[];
};

export function inboxDmFingerprint(accountId: string, conversationId: string): string {
  return `${accountId}:${conversationId}`;
}

function storageKey(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

function dmIsSeen(seenKeys: Set<string>, fingerprint: string): boolean {
  if (seenKeys.has(fingerprint)) return true;
  for (const key of seenKeys) {
    if (key.startsWith(`${fingerprint}:`)) return true;
  }
  return false;
}

export function loadInboxSeen(userId: string | undefined | null): InboxSeenStore {
  if (!userId) return { seeded: false, comments: [], dms: [] };
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { seeded: false, comments: [], dms: [] };
    const parsed = JSON.parse(raw) as Partial<InboxSeenStore>;
    return {
      seeded: Boolean(parsed.seeded),
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      dms: Array.isArray(parsed.dms) ? parsed.dms : [],
    };
  } catch {
    return { seeded: false, comments: [], dms: [] };
  }
}

function cap(ids: string[]): string[] {
  return ids.length > MAX ? ids.slice(ids.length - MAX) : ids;
}

export function saveInboxSeen(
  userId: string | undefined | null,
  next: InboxSeenStore,
): void {
  if (!userId) return;
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({
        seeded: true,
        comments: cap(next.comments),
        dms: cap(next.dms),
      }),
    );
    window.dispatchEvent(new Event(SEEN_EVENT));
  } catch {
    /* ignore quota */
  }
}

export function subscribeInboxSeen(
  userId: string | undefined | null,
  onChange: () => void,
): () => void {
  const key = userId ? storageKey(userId) : null;
  const onStorage = (e: StorageEvent) => {
    if (key && e.key === key) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SEEN_EVENT, onChange);
  };
}

export function countInboxUnread(
  seen: InboxSeenStore,
  commentIds: string[],
  dmFingerprints: string[],
): number {
  if (!seen.seeded) return 0;
  const comments = new Set(seen.comments);
  const dms = new Set(seen.dms);
  let n = 0;
  for (const id of commentIds) if (!comments.has(id)) n += 1;
  for (const id of dmFingerprints) if (!dmIsSeen(dms, id)) n += 1;
  return n;
}

export function mergeInboxSeen(
  seen: InboxSeenStore,
  commentIds: string[],
  dmFingerprints: string[],
): InboxSeenStore {
  const comments = new Set(seen.comments);
  const dms = new Set(seen.dms);
  for (const id of commentIds) comments.add(id);
  for (const id of dmFingerprints) dms.add(id);
  return {
    seeded: true,
    comments: [...comments],
    dms: [...dms],
  };
}

export function commentIdsFromThreads(
  threads: Array<{
    comment: { id: string; isOwn?: boolean };
    replies: Array<{ id: string; isOwn?: boolean }>;
  }>,
): string[] {
  const ids: string[] = [];
  for (const t of threads) {
    if (!t.comment.isOwn) ids.push(t.comment.id);
    for (const r of t.replies) {
      if (!r.isOwn) ids.push(r.id);
    }
  }
  return ids;
}

export function markInboxCommentsSeen(
  userId: string | undefined | null,
  commentIds: string[],
): void {
  if (!userId || !commentIds.length) return;
  saveInboxSeen(userId, mergeInboxSeen(loadInboxSeen(userId), commentIds, []));
}

export function markInboxDmsSeen(
  userId: string | undefined | null,
  dmFingerprints: string[],
): void {
  if (!userId || !dmFingerprints.length) return;
  saveInboxSeen(userId, mergeInboxSeen(loadInboxSeen(userId), [], dmFingerprints));
}
