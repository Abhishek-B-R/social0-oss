import { format, isSameDay, isSameYear, differenceInCalendarDays } from "date-fns";
import type {
  InboxDmMessage,
  InboxDmThread,
  InboxDmThreadError,
  InboxDmThreadResult,
} from "@/api/inbox";

/** Consecutive messages from one side within this gap share a bubble group. */
export const DM_GROUP_GAP_MS = 5 * 60_000;

export type DmLayoutItem<M extends InboxDmMessage> =
  | { kind: "day"; key: string; label: string }
  | { kind: "group"; key: string; own: boolean; messages: M[] };

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** "Today", "Yesterday", weekday within a week, else a calendar date. */
export function dmDayLabel(date: Date, now: Date = new Date()): string {
  const days = differenceInCalendarDays(now, date);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return format(date, "EEEE");
  return isSameYear(date, now)
    ? format(date, "EEE, MMM d")
    : format(date, "MMM d, yyyy");
}

/** Compact recency for the conversation list: "now", "5m", "3h", "Mon", "Sep 4". */
export function dmListTimeLabel(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  const t = parseTime(iso);
  if (t == null) return "";
  const diffMs = now.getTime() - t;
  if (diffMs < 60_000) return "now";
  if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)}m`;
  const date = new Date(t);
  if (isSameDay(date, now)) return `${Math.floor(diffMs / (60 * 60_000))}h`;
  if (differenceInCalendarDays(now, date) < 7) return format(date, "EEE");
  return isSameYear(date, now) ? format(date, "MMM d") : format(date, "MMM d, yyyy");
}

/** Clock time shown under a bubble group. */
export function dmMessageTimeLabel(iso: string | null | undefined): string {
  const t = parseTime(iso);
  return t == null ? "" : format(new Date(t), "h:mm a");
}

/**
 * Day separators + sender groups for a chronologically sorted message list.
 * Undated messages join the current group rather than inventing a day.
 */
export function layoutDmMessages<M extends InboxDmMessage>(
  messages: M[],
  now: Date = new Date(),
): DmLayoutItem<M>[] {
  const items: DmLayoutItem<M>[] = [];
  let current: Extract<DmLayoutItem<M>, { kind: "group" }> | null = null;
  let lastTime: number | null = null;
  let lastDay: Date | null = null;

  for (const message of messages) {
    const t = parseTime(message.createdAt);
    if (t != null) {
      const day = new Date(t);
      if (!lastDay || !isSameDay(day, lastDay)) {
        items.push({ kind: "day", key: `day-${t}`, label: dmDayLabel(day, now) });
        lastDay = day;
        current = null;
      }
    }
    const continues =
      current != null &&
      current.own === message.isOwn &&
      (t == null || lastTime == null || t - lastTime <= DM_GROUP_GAP_MS);
    if (continues && current) {
      current.messages.push(message);
    } else {
      current = {
        kind: "group",
        key: `group-${message.id || t || items.length}`,
        own: message.isOwn,
        messages: [message],
      };
      items.push(current);
    }
    if (t != null) lastTime = t;
  }
  return items;
}

/**
 * Merge thread pages (newest page first, as TanStack stores them) into one
 * chronological list. Duplicate ids across page boundaries keep one copy.
 */
export function flattenDmPages(
  pages: Pick<InboxDmThreadResult, "messages">[] | undefined,
): InboxDmMessage[] {
  if (!pages?.length) return [];
  const seen = new Set<string>();
  const out: InboxDmMessage[] = [];
  for (let i = pages.length - 1; i >= 0; i--) {
    for (const message of pages[i]!.messages) {
      if (message.id) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
      }
      out.push(message);
    }
  }
  return out.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/** Case-insensitive match on peer name, handle, snippet and account label. */
export function filterDmThreads<T extends InboxDmThread>(threads: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return threads;
  return threads.filter((t) =>
    [t.peerName, t.peerHandle, t.snippet, t.accountLabel].some((field) =>
      field?.toLowerCase().includes(q),
    ),
  );
}

/** Error thrown by the thread query so the UI can tell throttling from failure. */
export class InboxDmThreadLoadError extends Error {
  readonly code: InboxDmThreadError["code"];
  readonly retryAfterSec: number | null;

  constructor(result: InboxDmThreadError) {
    super(result.error);
    this.name = "InboxDmThreadLoadError";
    this.code = result.code;
    this.retryAfterSec = result.retryAfterSec ?? null;
  }

  get rateLimited(): boolean {
    return this.code === "rate_limited";
  }
}

export function isDmThreadRateLimited(error: unknown): boolean {
  return error instanceof InboxDmThreadLoadError && error.rateLimited;
}
