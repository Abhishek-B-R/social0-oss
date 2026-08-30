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
