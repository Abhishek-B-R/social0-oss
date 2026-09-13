/** Posts the user chose to ignore in Inbox Unanswered. */

const KEY_PREFIX = "s0:inbox:hidden-pubs";
const MAX = 400;
const EVENT = "s0-inbox-hidden-pubs";

function storageKey(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

export function loadHiddenInboxPublications(
  userId: string | undefined | null,
): string[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function save(userId: string, ids: string[]): void {
  try {
    const capped = ids.length > MAX ? ids.slice(ids.length - MAX) : ids;
    localStorage.setItem(storageKey(userId), JSON.stringify(capped));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore quota */
  }
}

export function hideInboxPublication(
  userId: string | undefined | null,
  publicationId: string,
): void {
  if (!userId || !publicationId) return;
  const next = new Set(loadHiddenInboxPublications(userId));
  next.add(publicationId);
  save(userId, [...next]);
}

export function unhideInboxPublication(
  userId: string | undefined | null,
  publicationId: string,
): void {
  if (!userId || !publicationId) return;
  save(
    userId,
    loadHiddenInboxPublications(userId).filter((id) => id !== publicationId),
  );
}

export function subscribeHiddenInboxPublications(
  userId: string | undefined | null,
  onChange: () => void,
): () => void {
  const key = userId ? storageKey(userId) : null;
  const onStorage = (e: StorageEvent) => {
    if (key && e.key === key) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}
