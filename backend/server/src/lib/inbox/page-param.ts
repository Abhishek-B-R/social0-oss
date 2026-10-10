import { createHash } from "node:crypto";

export type InboxPageCursor = {
  range: "custom";
  since?: string;
  until?: string;
  before?: string;
};

/** Hard ceiling so a sticky hasMore from the API cannot page forever. */
export const INBOX_MAX_PAGES = 12;

/**
 * Next infinite-query page for inbox comments/DMs.
 *
 * Rules (all must pass or we stop):
 * 1. Stay inside the selected date window - only `before` cursors, never
 *    invent older time ranges (that caused year-long empty refresh storms).
 * 2. Previous page must have returned at least one item - empty + hasMore
 *    from budget cuts must not keep firing.
 * 3. Cap total pages at INBOX_MAX_PAGES.
 */
export function nextInboxPageParam(last: {
  hasMore?: boolean;
  sampled?: boolean;
  nextBefore?: string | null;
  since: string;
  until: string;
  itemCount: number;
}): InboxPageCursor | undefined {
  if (last.itemCount <= 0) return undefined;
  const hasMore = last.hasMore ?? last.sampled ?? false;
  if (!hasMore || !last.nextBefore) return undefined;
  return {
    range: "custom",
    since: last.since,
    until: last.until,
    before: last.nextBefore,
  };
}

/** TanStack `getNextPageParam` adapter with page-count guard. */
export function inboxGetNextPageParam<
  TPage extends {
    hasMore?: boolean;
    sampled?: boolean;
    nextBefore?: string | null;
    since: string;
    until: string;
    threads: { length: number };
  },
>(
  last: TPage,
  _pages: TPage[],
  _lastPageParam: unknown,
  allPageParams: unknown[],
): InboxPageCursor | undefined {
  if (allPageParams.length >= INBOX_MAX_PAGES) return undefined;
  return nextInboxPageParam({
    hasMore: last.hasMore,
    sampled: last.sampled,
    nextBefore: last.nextBefore,
    since: last.since,
    until: last.until,
    itemCount: last.threads.length,
  });
}

/**
 * DM list rows older than a `before` cursor.
 *
 * Strictly older: with `<=` the previous page's last conversation came back as
 * the first row of every subsequent page, so "Load older" duplicated a row and
 * stopped making progress once the tail repeated.
 */
export function olderThanDmCursor<T extends { lastMessageAt: string | null }>(
  threads: T[],
  beforeMs: number | undefined,
): T[] {
  if (beforeMs == null) return threads;
  return threads.filter((t) => {
    const ts = t.lastMessageAt ? Date.parse(t.lastMessageAt) : NaN;
    return Number.isFinite(ts) && ts < beforeMs;
  });
}

/** Lookback every DM list read covers, whatever range the user picked. */
export const DM_LIST_LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DmListFetchPlan = {
  /** Oldest activity the platform fetch walks back to. */
  fetchSince: Date;
  /** Platform-read cache suffix for that fetch. */
  suffix: string;
};

/**
 * Platform fetch window + cache key for a DM list read.
 *
 * Platform DM list APIs are newest-first and cannot start from an arbitrary
 * `until`, so the fetch never depends on the requested range or the `before`
 * cursor: one cached list per account covers the standard lookback, and range
 * switches, "Load older" pages and reply verification are all filters over
 * it. Keying the cache on range and cursor (as before) re-walked every
 * platform's DM history on each of those actions.
 *
 * Only a window reaching past the lookback (e.g. 1Y) gets its own, wider read.
 */
export function dmListFetchPlan(opts: { since: Date; now?: Date }): DmListFetchPlan {
  const now = opts.now ?? new Date();
  const lookbackSince = new Date(now.getTime() - DM_LIST_LOOKBACK_DAYS * DAY_MS);
  if (opts.since.getTime() >= lookbackSince.getTime()) {
    return {
      fetchSince: lookbackSince,
      suffix: `lookback:${DM_LIST_LOOKBACK_DAYS}d`,
    };
  }
  return { fetchSince: opts.since, suffix: `since:${opts.since.toISOString()}` };
}

/**
 * Cache suffix for one page of a DM thread. The newest page keeps the bare
 * conversation id so reply verification and post-send invalidation find it.
 */
export function dmThreadCacheSuffix(
  conversationId: string,
  cursor: string | null,
): string {
  if (!cursor) return conversationId;
  const digest = createHash("sha1").update(cursor).digest("hex").slice(0, 16);
  return `${conversationId}:c:${digest}`;
}
