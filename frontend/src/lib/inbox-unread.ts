/** Last-seen ids for the dashboard Inbox nav badge. First visit seeds, no historical flood. */

const KEY = "s0:inbox:seen-ids";
const MAX = 800;
const SEEN_EVENT = "s0-inbox-seen";

export type InboxSeenStore = {
  seeded: boolean;
  comments: string[];
  dms: string[];
};

export function inboxDmFingerprint(accountId: string, conversationId: string, lastMessageAt: string | null): string {
  return `${accountId}:${conversationId}:${lastMessageAt ?? ""}`;
}

export function loadInboxSeen(): InboxSeenStore {
  try {
    const raw = localStorage.getItem(KEY);
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

export function saveInboxSeen(next: InboxSeenStore): void {
  try {
    localStorage.setItem(
      KEY,
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

export function subscribeInboxSeen(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
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
  for (const id of dmFingerprints) if (!dms.has(id)) n += 1;
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
