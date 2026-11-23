/**
 * "Reconnect & retry": before leaving for the OAuth re-auth, remember which
 * publications to retry. When the user is back on the post (the re-auth
 * redirect forwards `returnTo`, or they open the post again) and the server
 * says the account was re-authorized after the delivery failed
 * (`reconnectedSinceFailure`), the post detail page runs the retry once and
 * clears the note. Until then the note stays, so a cancelled consent screen
 * never retries with the dead token.
 * Per-tab sessionStorage; failures to read/write just skip the auto-retry.
 */

const KEY = "social0.posts.retryAfterReconnect";
const MAX_AGE_MS = 30 * 60 * 1000;

export type PendingRetry = {
  postId: string;
  publicationIds: string[];
  accountId: string;
  at: number;
};

function readAll(): PendingRetry[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (e): e is PendingRetry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as PendingRetry).postId === "string" &&
        typeof (e as PendingRetry).accountId === "string" &&
        Array.isArray((e as PendingRetry).publicationIds) &&
        typeof (e as PendingRetry).at === "number" &&
        now - (e as PendingRetry).at < MAX_AGE_MS,
    );
  } catch {
    return [];
  }
}

function writeAll(entries: PendingRetry[]) {
  try {
    if (entries.length === 0) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage blocked: no auto-retry */
  }
}

export function rememberRetryAfterReconnect(entry: Omit<PendingRetry, "at">) {
  const rest = readAll().filter(
    (e) => !(e.postId === entry.postId && e.accountId === entry.accountId),
  );
  writeAll([...rest, { ...entry, at: Date.now() }]);
}

/** Pending retries for this post (not removed). */
export function peekRetriesAfterReconnect(postId: string): PendingRetry[] {
  return readAll().filter((e) => e.postId === postId);
}

/**
 * Drop the note for this post + account. With `publicationIds`, drop only
 * those publications and keep the rest (same timestamp) for a later retry.
 */
export function clearRetryAfterReconnect(
  postId: string,
  accountId: string,
  publicationIds?: string[],
) {
  const next: PendingRetry[] = [];
  for (const e of readAll()) {
    if (e.postId !== postId || e.accountId !== accountId) {
      next.push(e);
      continue;
    }
    if (!publicationIds) continue;
    const left = e.publicationIds.filter((id) => !publicationIds.includes(id));
    if (left.length > 0) next.push({ ...e, publicationIds: left });
  }
  writeAll(next);
}

/** Add `returnTo=<app path>` so the OAuth flow can bring the user back. */
export function withReturnTo(href: string, returnPath: string): string {
  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("returnTo", returnPath);
    return url.origin === window.location.origin && !/^https?:/i.test(href)
      ? `${url.pathname}${url.search}${url.hash}`
      : url.toString();
  } catch {
    return href;
  }
}
