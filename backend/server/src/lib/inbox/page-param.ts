const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export type InboxPageCursor = {
  range: "custom";
  since?: string;
  until?: string;
  before?: string;
};

export function nextInboxPageParam(last: {
  hasMore?: boolean;
  sampled?: boolean;
  nextBefore?: string | null;
  since: string;
  until: string;
  itemCount: number;
}): InboxPageCursor | undefined {
  const hasMore = last.hasMore ?? last.sampled ?? false;
  if (hasMore && last.nextBefore) {
    return {
      range: "custom",
      since: last.since,
      until: last.until,
      before: last.nextBefore,
    };
  }
  if (last.itemCount === 0) return undefined;
  const untilMs = Date.parse(last.since);
  const span = Date.parse(last.until) - Date.parse(last.since);
  if (!Number.isFinite(untilMs) || !Number.isFinite(span) || span <= 0) {
    return undefined;
  }
  const min = Date.now() - YEAR_MS;
  if (untilMs <= min) return undefined;
  const sinceMs = Math.max(untilMs - span, min);
  if (sinceMs >= untilMs) return undefined;
  return {
    range: "custom",
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
  };
}
