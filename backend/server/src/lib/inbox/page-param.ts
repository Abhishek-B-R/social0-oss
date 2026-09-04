import { calendarDayKey } from "../date-window.js";

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

/**
 * Platform-read cache key for a DM list page.
 *
 * Must not carry a moving `until`: for a preset range `until` is `now`, so
 * keying on it made every request unique, the DM list never hit cache, and each
 * page load burned scarce X / Bluesky DM quota (`fresh` meant nothing either).
 * Page cursors are exact; the live head buckets by calendar day and relies on
 * the read TTL for freshness.
 */
export function dmListCacheSuffix(opts: {
  since: Date;
  untilForFetch: Date;
  hasCursor: boolean;
  timeZone: string;
}): string {
  const tail = opts.hasCursor
    ? `before:${opts.untilForFetch.toISOString()}`
    : `live:${calendarDayKey(opts.untilForFetch, opts.timeZone)}`;
  return `${opts.since.toISOString()}:${tail}`;
}
