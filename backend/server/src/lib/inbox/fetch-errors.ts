import type { InboxNotice } from "./types.js";

/** Collapse inbox fetch failures so one missing account cannot paint 200 red lines. */

export function isGonePlatformPost(error: string): boolean {
  return /could not be found|videoNotFound|post not found|thread is gated|RecordNotFound|does not exist|notFound/i.test(
    error,
  );
}

export function sanitizeInboxFetchError(error: string): string {
  const stripped = error.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return "Request failed";
  if (isGonePlatformPost(stripped)) {
    return "Post is no longer available on the platform.";
  }
  return stripped.slice(0, 180);
}

export function noteFetchError(
  list: Array<{ accountId: string; platform: string; error: string }>,
  item: { accountId: string; platform: string; error: string },
): void {
  if (isGonePlatformPost(item.error)) return;
  const error = sanitizeInboxFetchError(item.error);
  if (
    list.some(
      (e) => e.platform === item.platform && e.error === error,
    )
  ) {
    return;
  }
  list.push({ ...item, error });
}

/** Platform limits shown as info, not failures (e.g. X Recent Search window). */
export function isInboxFetchNotice(error: string): boolean {
  return /only go back|Recent Search/i.test(error);
}

export function noteFetchNotice(
  list: InboxNotice[],
  item: InboxNotice,
): void {
  const message = item.message.trim().slice(0, 180);
  if (!message) return;
  const existing = list.find((n) => n.platform === item.platform && n.message === message);
  if (existing) {
    // Several accounts on one network: keep the oldest saved time and the
    // latest retry time so the notice stays honest.
    if (item.cachedAt && (!existing.cachedAt || item.cachedAt < existing.cachedAt)) {
      existing.cachedAt = item.cachedAt;
    }
    if (item.retryAt && (!existing.retryAt || item.retryAt > existing.retryAt)) {
      existing.retryAt = item.retryAt;
    }
    return;
  }
  list.push({ ...item, message });
}

/** Notice for a read served from saved data because of a rate limit. */
export function staleNotice(
  platform: string,
  what: "comments" | "DMs",
  cachedAt: number | undefined,
): InboxNotice {
  return {
    platform,
    kind: "stale",
    message: `Showing saved ${what}. New ones appear once the network lets us check again.`,
    ...(cachedAt ? { cachedAt: new Date(cachedAt).toISOString() } : {}),
  };
}

/** Notice for a read that has nothing saved yet and will retry by itself. */
export function retryNotice(
  platform: string,
  what: "comments" | "DMs",
  retryAt: number,
): InboxNotice {
  return {
    platform,
    kind: "retry",
    message: `Loading ${what}. This network limits how often we can check, so it may take a minute.`,
    retryAt: new Date(retryAt).toISOString(),
  };
}
