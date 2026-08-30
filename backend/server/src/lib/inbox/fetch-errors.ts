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
  list: Array<{ platform: string; message: string }>,
  item: { platform: string; message: string },
): void {
  const message = item.message.trim().slice(0, 180);
  if (!message) return;
  if (list.some((n) => n.platform === item.platform && n.message === message)) {
    return;
  }
  list.push({ platform: item.platform, message });
}
