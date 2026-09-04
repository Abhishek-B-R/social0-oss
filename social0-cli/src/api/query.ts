import type { AnalyticsWindowQuery, InboxListQuery } from "../types/index.js";

/** `?…` for analytics reads. Omits empty values so cache keys stay stable. */
export function analyticsQueryString(query: AnalyticsWindowQuery): string {
  const params = new URLSearchParams();
  if (query.range) params.set("range", query.range);
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);
  if (query.accountId) params.set("account_id", query.accountId);
  if (query.fresh) params.set("fresh", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** `?…` for inbox reads (adds platform, cursor, and page size). */
export function inboxQueryString(query: InboxListQuery): string {
  const params = new URLSearchParams();
  if (query.range) params.set("range", query.range);
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);
  if (query.accountId) params.set("account_id", query.accountId);
  if (query.platform) params.set("platform", query.platform);
  if (query.before) params.set("before", query.before);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.fresh) params.set("fresh", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
