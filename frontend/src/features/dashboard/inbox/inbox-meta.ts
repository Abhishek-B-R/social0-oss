import type {
  InboxFetchError,
  InboxNotice,
  InboxReconnectHint,
} from "@/api/inbox";

function mergeInboxMeta<T extends { platform: string }>(
  pages: Array<Record<string, unknown>> | undefined,
  key: string,
  dedupe: (item: T) => string,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages ?? []) {
    const list = page[key] as T[] | undefined;
    for (const item of list ?? []) {
      const id = dedupe(item);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
  }
  return out;
}

/**
 * Reconnect hints must come from the freshest page only.
 * Infinite scroll keeps older pages; merging reconnect across them leaves
 * accounts nagging after a successful reconnect + first-page refresh.
 */
export function inboxReconnectFromPages(
  pages:
    | Array<{ accountsNeedingReconnect?: InboxReconnectHint[] }>
    | undefined,
): InboxReconnectHint[] {
  return pages?.[0]?.accountsNeedingReconnect ?? [];
}

export function inboxMetaFromPages(
  pages:
    | Array<{
        accountsNeedingReconnect?: InboxReconnectHint[];
        notices?: InboxNotice[];
        fetchErrors?: InboxFetchError[];
        unsupported?: string[];
      }>
    | undefined,
) {
  return {
    reconnect: inboxReconnectFromPages(pages),
    notices: mergeInboxMeta<InboxNotice>(
      pages,
      "notices",
      (n) => `${n.platform}:${n.message}`,
    ),
    fetchErrors: mergeInboxMeta<InboxFetchError>(
      pages,
      "fetchErrors",
      (e) => `${e.accountId}:${e.error}`,
    ),
    unsupported: [...new Set((pages ?? []).flatMap((p) => p.unsupported ?? []))],
  };
}
