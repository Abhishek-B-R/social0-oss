/**
 * Pure helpers for the Calendar page: timezone-aware day buckets, chip
 * tones, queue-slot expansion and time formatting. No React here.
 *
 * Time model: every post has an instant (`at`). The grid works on
 * "wall" Dates (`WallDate`) whose fields equal the clock in the user's
 * timezone. Anything sent back to the API goes through `fromWall` first.
 */
import {
  addDays,
  addHours,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { fromZonedTime, getTimezoneOffset } from "date-fns-tz";
import type { LoadCalendarPageDataResult } from "@/api/dashboard-data";
import { isAgentSource, type PostSourceDto } from "@/api/dashboard";
import {
  getPostSourceFromDto,
  toPillStatus,
  type NetworkStackItem,
  type PillStatus,
  type PostSourceInfo,
} from "@/components/app";

export const WEEK_STARTS_ON = 1 as const; // Monday, same as before the redesign

export const CALENDAR_VIEWS = ["month", "week", "list"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export function isCalendarView(v: string | null | undefined): v is CalendarView {
  return v === "month" || v === "week" || v === "list";
}

export type CalendarData = Extract<LoadCalendarPageDataResult, { ok: true }>["data"];
export type CalendarApiPost = CalendarData["posts"][number];
export type CalendarPublication = NonNullable<CalendarApiPost["publications"]>[number];

/** Row from `GET /api/queue/slots` (hour/minute in the workspace timezone). */
export type QueueSlotRow = {
  id: string;
  daysOfWeek: number[] | null;
  hour: number;
  minute: number;
  isActive: boolean | null;
};

export type OpenQueueSlot = {
  slotId: string;
  at: Date;
  wall: Date;
  dayKey: string;
  /** Minutes since local midnight (display timezone). */
  minutes: number;
};

export type CalendarEvent = {
  id: string;
  snippet: string;
  rawStatus: string;
  pill: PillStatus;
  isDraft: boolean;
  /** Instant the post is scheduled for / was published at. */
  at: Date;
  /** Same instant as a wall-clock Date in the display timezone. */
  wall: Date;
  dayKey: string;
  minutes: number;
  publications: CalendarPublication[];
  networks: NetworkStackItem[];
  source: PostSourceInfo;
  /** Failed deliveries (with an error kind for the fix button). */
  failed: CalendarPublication[];
  /** Scheduled posts targeting an account whose sign-in expired. */
  brokenAccountIds: string[];
  /** Scheduled + in the future: may be dragged (role gate applies on top). */
  movable: boolean;
  /** First-account fallback when the API returned no publications (old rows). */
  fallbackPlatform: string | null;
};

// ---------------------------------------------------------------------------
// Timezone
// ---------------------------------------------------------------------------

function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The stored workspace timezone when valid, else null. */
export function storedTimezone(tz: string | null | undefined): string | null {
  const t = typeof tz === "string" ? tz.trim() : "";
  return t && isValidZone(t) ? t : null;
}

/** Zone the grid is drawn in: the saved timezone, else the browser's. */
export function displayTimezone(tz: string | null | undefined): string {
  const saved = storedTimezone(tz);
  if (saved) return saved;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * A wall-clock Date whose "local" fields are its UTC fields, so date-fns
 * (`format`, `startOfDay`, `addDays`, `setHours`, …) reads and writes the
 * clock of the display timezone with no DST of its own. A plain local Date
 * can't hold a time that falls in the browser's spring-forward gap (02:30 on
 * that day jumps to 03:30) even when the saved timezone has no such gap.
 * date-fns keeps the class through `constructFrom`, so derived dates stay
 * wall dates too. Build them only through the helpers below.
 */
export class WallDate extends Date {
  override getFullYear() {
    return this.getUTCFullYear();
  }
  override getMonth() {
    return this.getUTCMonth();
  }
  override getDate() {
    return this.getUTCDate();
  }
  override getDay() {
    return this.getUTCDay();
  }
  override getHours() {
    return this.getUTCHours();
  }
  override getMinutes() {
    return this.getUTCMinutes();
  }
  override getSeconds() {
    return this.getUTCSeconds();
  }
  override getMilliseconds() {
    return this.getUTCMilliseconds();
  }
  override getTimezoneOffset() {
    return 0;
  }
  override setFullYear(...args: Parameters<Date["setFullYear"]>) {
    return this.setUTCFullYear(...args);
  }
  override setMonth(...args: Parameters<Date["setMonth"]>) {
    return this.setUTCMonth(...args);
  }
  override setDate(...args: Parameters<Date["setDate"]>) {
    return this.setUTCDate(...args);
  }
  override setHours(...args: Parameters<Date["setHours"]>) {
    return this.setUTCHours(...args);
  }
  override setMinutes(...args: Parameters<Date["setMinutes"]>) {
    return this.setUTCMinutes(...args);
  }
  override setSeconds(...args: Parameters<Date["setSeconds"]>) {
    return this.setUTCSeconds(...args);
  }
  override setMilliseconds(...args: Parameters<Date["setMilliseconds"]>) {
    return this.setUTCMilliseconds(...args);
  }
}

/** Wall date for a calendar date + clock time, or null when it doesn't exist. */
function wallFromParts(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
): Date | null {
  const wall = new WallDate(0);
  wall.setUTCFullYear(y, m - 1, d);
  wall.setUTCHours(hh, mm, 0, 0);
  if (
    Number.isNaN(wall.getTime()) ||
    wall.getUTCFullYear() !== y ||
    wall.getUTCMonth() !== m - 1 ||
    wall.getUTCDate() !== d ||
    wall.getUTCHours() !== hh ||
    wall.getUTCMinutes() !== mm
  ) {
    return null;
  }
  return wall;
}

export function toWall(at: Date, tz: string): Date {
  return new WallDate(at.getTime() + getTimezoneOffset(tz, at));
}

export function fromWall(wall: Date, tz: string): Date {
  // Through a zone-less ISO string so the browser's own zone never applies.
  return fromZonedTime(format(wall, "yyyy-MM-dd'T'HH:mm:ss.SSS"), tz);
}

export function dayKeyOf(wall: Date): string {
  return format(wall, "yyyy-MM-dd");
}

/** Parse a `yyyy-MM-dd` key into a wall Date at midnight, or null. */
export function parseDayKey(key: string | null | undefined): Date | null {
  const m = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
  if (!m) return null;
  return wallFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** `datetime-local` value ("yyyy-MM-ddTHH:mm") for a wall Date. */
export function wallInputValue(wall: Date): string {
  return format(wall, "yyyy-MM-dd'T'HH:mm");
}

/** Parse a `datetime-local` value into a wall Date, or null. */
export function parseWallInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  if (!m) return null;
  return wallFromParts(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
}

export function minutesOf(wall: Date): number {
  return wall.getHours() * 60 + wall.getMinutes();
}

export function atMinutes(day: Date, minutes: number): Date {
  const d = startOfDay(day);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function timeLabel(wall: Date, use24: boolean): string {
  return format(wall, use24 ? "HH:mm" : "h:mm a");
}

/** Time for chips: "9:00 AM" / "14:00". */
export function chipTimeLabel(wall: Date, use24: boolean): string {
  return format(wall, use24 ? "HH:mm" : "h:mm a");
}

export function dayTitle(wall: Date): string {
  return format(wall, "EEE d MMM");
}

export function longDayTitle(wall: Date): string {
  return format(wall, "EEEE d MMMM yyyy");
}

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

export type VisibleRange = { start: Date; end: Date; days: Date[] };

export function monthGrid(anchor: Date): VisibleRange {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON });
  return { start, end: addDays(startOfDay(end), 1), days: daysBetween(start, end) };
}

export function weekRange(anchor: Date): VisibleRange {
  const start = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  const end = addDays(start, 7);
  return { start, end, days: daysBetween(start, addDays(start, 6)) };
}

export function monthRange(anchor: Date): VisibleRange {
  const start = startOfMonth(anchor);
  const end = addMonths(start, 1);
  return { start, end, days: daysBetween(start, endOfMonth(anchor)) };
}

function daysBetween(start: Date, lastInclusive: Date): Date[] {
  const out: Date[] = [];
  const n = differenceInCalendarDays(lastInclusive, start);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

export function rangeFor(view: CalendarView, anchor: Date): VisibleRange {
  if (view === "week") return weekRange(anchor);
  if (view === "list") return monthRange(anchor);
  return monthGrid(anchor);
}

export function periodLabel(view: CalendarView, anchor: Date): string {
  if (view === "week") {
    const { start } = weekRange(anchor);
    const end = addDays(start, 6);
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    }
    if (start.getFullYear() === end.getFullYear()) {
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    }
    return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
  }
  return format(anchor, "MMMM yyyy");
}

export function shiftAnchor(view: CalendarView, anchor: Date, dir: 1 | -1): Date {
  if (view === "week") return addDays(anchor, 7 * dir);
  return startOfMonth(addMonths(anchor, dir));
}

// ---------------------------------------------------------------------------
// Posts → events
// ---------------------------------------------------------------------------

/** Chip label for a post's creator ("You", teammate, "ChatGPT · MCP", …). */
export function sourceInfo(dto: PostSourceDto | null | undefined): PostSourceInfo {
  return getPostSourceFromDto(dto);
}

function eventInstant(p: CalendarApiPost): Date | null {
  const raw =
    (p.status === "scheduled" || p.status === "draft") && p.scheduledAt
      ? p.scheduledAt
      : p.displayDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildEvents(
  posts: CalendarApiPost[],
  opts: { tz: string; nowMs: number; brokenAccountIds: ReadonlySet<string> },
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const p of posts) {
    const at = eventInstant(p);
    if (!at) continue;
    const wall = toWall(at, opts.tz);
    const rawStatus = (p.status ?? "scheduled").toLowerCase();
    const pubs = p.publications ?? [];
    const isDraft = rawStatus === "draft";
    const pill = toPillStatus(rawStatus, { isAgentDraft: isDraft && isAgentSource(p.source) });
    const showDeliveryDots = rawStatus !== "scheduled" && !isDraft;
    const broken =
      rawStatus === "scheduled"
        ? pubs
            .map((x) => x.connectedAccountId)
            .filter((id): id is string => !!id && opts.brokenAccountIds.has(id))
        : [];
    const networks: NetworkStackItem[] =
      pubs.length > 0
        ? pubs.map((x) => ({
            key: x.publicationId,
            network: x.platform,
            status: showDeliveryDots
              ? x.status
              : x.connectedAccountId && broken.includes(x.connectedAccountId)
                ? "warning"
                : null,
            hint: x.platformUsername ? `@${x.platformUsername.replace(/^@/, "")}` : undefined,
          }))
        : p.platform
          ? [{ network: p.platform }]
          : [];
    out.push({
      id: p.id,
      snippet: p.snippet?.trim() || "(No caption)",
      rawStatus,
      pill,
      isDraft,
      at,
      wall,
      dayKey: dayKeyOf(wall),
      minutes: minutesOf(wall),
      publications: pubs,
      networks,
      source: sourceInfo(p.source),
      failed: pubs.filter((x) => (x.status ?? "").toLowerCase() === "failed"),
      brokenAccountIds: broken,
      movable: rawStatus === "scheduled" && at.getTime() > opts.nowMs,
      fallbackPlatform: p.platform,
    });
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out;
}

export function groupByDay<T extends { dayKey: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.dayKey);
    if (list) list.push(item);
    else map.set(item.dayKey, [item]);
  }
  return map;
}

export function filterByAccount(events: CalendarEvent[], accountId: string | null): CalendarEvent[] {
  if (!accountId) return events;
  return events.filter((e) => e.publications.some((p) => p.connectedAccountId === accountId));
}

// ---------------------------------------------------------------------------
// Queue slots
// ---------------------------------------------------------------------------

export function minuteBucket(at: Date): number {
  return Math.floor(at.getTime() / 60_000);
}

/**
 * Concrete open queue slots between two wall dates (display tz). A slot is
 * open when it is in the future and no scheduled post sits at that minute.
 * Slot times are defined in the workspace's saved timezone (UTC if unset,
 * matching the server's queue logic).
 */
export function expandOpenSlots(
  slots: QueueSlotRow[],
  opts: {
    fromWall: Date;
    toWall: Date;
    displayTz: string;
    slotTz: string;
    occupied: ReadonlySet<number>;
    nowMs: number;
  },
): OpenQueueSlot[] {
  const active = slots.filter(
    (s) => s.isActive !== false && Array.isArray(s.daysOfWeek) && s.daysOfWeek.length > 0,
  );
  if (active.length === 0) return [];
  const fromMs = fromWall(startOfDay(opts.fromWall), opts.displayTz).getTime();
  const toMs = fromWall(startOfDay(opts.toWall), opts.displayTz).getTime();
  const out: OpenQueueSlot[] = [];
  const seen = new Set<string>();
  // Walk slot-tz calendar days with a one-day margin either side so a zone
  // offset between slot tz and display tz never drops an edge slot.
  const first = addDays(startOfDay(opts.fromWall), -1);
  const total = differenceInCalendarDays(opts.toWall, opts.fromWall) + 2;
  for (let i = 0; i <= total; i++) {
    const day = addDays(first, i);
    const dow = getDay(day);
    for (const s of active) {
      if (!s.daysOfWeek!.includes(dow)) continue;
      const at = fromWall(atMinutes(day, s.hour * 60 + s.minute), opts.slotTz);
      const ms = at.getTime();
      if (ms < fromMs || ms >= toMs || ms <= opts.nowMs) continue;
      if (opts.occupied.has(minuteBucket(at))) continue;
      const key = `${s.id}:${ms}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const wall = toWall(at, opts.displayTz);
      out.push({ slotId: s.id, at, wall, dayKey: dayKeyOf(wall), minutes: minutesOf(wall) });
    }
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out;
}

/** Slot id whose time matches `at` exactly (used to restore a queue link on Undo). */
export function slotIdAt(slots: QueueSlotRow[], at: Date, slotTz: string): string | null {
  const wall = toWall(at, slotTz);
  const dow = getDay(wall);
  const m = minutesOf(wall);
  if (wall.getSeconds() !== 0) return null;
  const hit = slots.find(
    (s) =>
      s.isActive !== false &&
      (s.daysOfWeek ?? []).includes(dow) &&
      s.hour * 60 + s.minute === m,
  );
  return hit?.id ?? null;
}

// ---------------------------------------------------------------------------
// Create-at helpers
// ---------------------------------------------------------------------------

const DEFAULT_CREATE_MINUTES = 9 * 60;

/**
 * Best time to suggest for "New post" on a day: the first open queue slot,
 * else 9:00, else (today, past 9:00) the next whole hour. Null for past days
 * or when nothing is left today.
 */
export function suggestedCreateWall(
  day: Date,
  openSlots: OpenQueueSlot[],
  nowWall: Date,
): Date | null {
  const dayStart = startOfDay(day);
  const todayStart = startOfDay(nowWall);
  if (dayStart < todayStart) return null;
  const slot = openSlots.find((s) => s.wall > nowWall);
  if (slot) return slot.wall;
  const nine = atMinutes(dayStart, DEFAULT_CREATE_MINUTES);
  if (nine > nowWall) return nine;
  const next = addHours(startOfHour(nowWall), 1);
  return dayKeyOf(next) === dayKeyOf(dayStart) ? next : null;
}

/**
 * Chip colors per pill status (tokens only). Soft tint, no outline: the
 * tint already says the status. Drafts keep a dashed outline because they
 * have no tint to tell them apart.
 */
export const CHIP_TONE: Record<PillStatus, string> = {
  draft: "border-dashed border-border bg-bg-elevated text-text-muted",
  needs_review: "border-dashed border-agent-border bg-agent-soft text-text",
  scheduled: "border-transparent bg-info-soft text-text",
  publishing: "border-transparent bg-info-soft text-text",
  published: "border-transparent bg-ok-soft text-text",
  partly_published: "border-transparent bg-warning-soft text-text",
  failed: "border-transparent bg-danger-soft text-text",
  healthy: "border-transparent bg-ok-soft text-text",
  sign_in_expired: "border-transparent bg-warning-soft text-text",
};

export const DOT_TONE: Record<PillStatus, string> = {
  draft: "border border-dashed border-text-subtle bg-transparent",
  needs_review: "bg-agent",
  scheduled: "bg-info",
  publishing: "bg-info",
  published: "bg-ok",
  partly_published: "bg-warning-solid",
  failed: "bg-danger",
  healthy: "bg-ok",
  sign_in_expired: "bg-warning-solid",
};

export const DRAG_MIME = "application/x-social0-post";

/**
 * Open queue slots grouped by day for the visible range (plus the day the
 * drawer shows, when it is outside the range).
 */
export function openSlotsByDay(
  slots: QueueSlotRow[] | undefined,
  events: CalendarEvent[],
  opts: {
    fromKey: string;
    toKey: string;
    extraDayKey: string | null;
    displayTz: string;
    slotTz: string;
    nowMs: number;
  },
): Map<string, OpenQueueSlot[]> {
  if (!slots?.length) return new Map();
  let from = parseDayKey(opts.fromKey);
  let to = parseDayKey(opts.toKey);
  if (!from || !to) return new Map();
  const extra = parseDayKey(opts.extraDayKey);
  if (extra) {
    if (extra < from) from = extra;
    const after = addDays(extra, 1);
    if (after > to) to = after;
  }
  const occupied = new Set(
    events
      .filter((e) => e.rawStatus === "scheduled" || e.rawStatus === "publishing")
      .map((e) => minuteBucket(e.at)),
  );
  return groupByDay(
    expandOpenSlots(slots, {
      fromWall: from,
      toWall: to,
      displayTz: opts.displayTz,
      slotTz: opts.slotTz,
      occupied,
      nowMs: opts.nowMs,
    }),
  );
}
