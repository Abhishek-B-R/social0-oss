import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Small natural-language time parser for the schedule popover.
 *
 * Understands, in the person's timezone:
 *   "tomorrow 9am", "fri 6pm", "next monday 10:30", "today 3", "tonight",
 *   "in 2 hours", "in 30 min", "in 3 days", "jan 5 9am", "5 jan",
 *   "2026-11-02 14:00", "21/10 9am" (day/month order follows the date format),
 *   "noon", "9am" (next time it is 9am), "now".
 * Returns null when it can't read the text.
 */
export function parseNaturalTime(
  input: string,
  opts: { timezone: string; now?: Date; dateFormat?: string | null },
): Date | null {
  const now = opts.now ?? new Date();
  const tz = safeTimezone(opts.timezone);
  let s = input
    .toLowerCase()
    .replace(/[,]/g, " ")
    .replace(/\b(at|on)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  if (s === "now" || s === "right now") return now;

  // Relative offsets: "in 2 hours", "30 min", "in half an hour".
  const rel = parseRelative(s);
  if (rel != null) return new Date(now.getTime() + rel);

  // Split off the time-of-day part.
  let time: { h: number; m: number } | null = null;
  const defaultHour = 9;
  const word = TIME_WORDS.find(([w]) => new RegExp(`(^|\\s)${w}($|\\s)`).test(s));
  if (word) {
    time = { h: word[1], m: 0 };
    s = s.replace(new RegExp(`(^|\\s)${word[0]}($|\\s)`), " ").trim();
    if (word[0] === "tonight") s = `today ${s}`.trim();
  } else {
    const ampm = s.match(
      /(^|\s)(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|a|p)(?=\s|$)/,
    );
    const clock = s.match(/(^|\s)(\d{1,2}):(\d{2})(?=\s|$)/);
    if (ampm) {
      let h = Number(ampm[2]);
      const m = ampm[3] ? Number(ampm[3]) : 0;
      const pm = ampm[4]!.startsWith("p");
      if (h < 1 || h > 12 || m > 59) return null;
      if (h === 12) h = 0;
      if (pm) h += 12;
      time = { h, m };
      s = s.replace(ampm[0], " ").trim();
    } else if (clock) {
      const h = Number(clock[2]);
      const m = Number(clock[3]);
      if (h > 23 || m > 59) return null;
      time = { h, m };
      s = s.replace(clock[0], " ").trim();
    }
  }

  const wallNow = toZonedTime(now, tz);
  const today = new Date(
    wallNow.getFullYear(),
    wallNow.getMonth(),
    wallNow.getDate(),
  );

  // A bare trailing hour after a day word: "tomorrow 3" → 3 PM.
  if (!time) {
    const bare = s.match(/^(.*\S)\s(\d{1,2})$/);
    if (bare && parseDay(bare[1]!, today, wallNow, opts.dateFormat, null)) {
      time = { h: bareHour(Number(bare[2])), m: 0 };
      s = bare[1]!;
    }
  }

  let day: Date | null = null;
  if (s) {
    day = parseDay(s, today, wallNow, opts.dateFormat, time);
    if (!day) return null;
  }

  if (!day && !time) return null;

  if (!time) {
    if (day && sameDay(day, today)) {
      // "today" alone: the next whole hour.
      const next = new Date(wallNow);
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      return fromZonedTime(next, tz);
    }
    time = { h: defaultHour, m: 0 };
  }

  let wall: Date;
  if (day) {
    wall = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      time.h,
      time.m,
    );
  } else {
    wall = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      time.h,
      time.m,
    );
    // Only a time: the next time the clock reads that.
    if (wall.getTime() <= wallNow.getTime()) {
      wall = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 1,
        time.h,
        time.m,
      );
    }
  }
  return fromZonedTime(wall, tz);
}

const TIME_WORDS: ReadonlyArray<readonly [string, number]> = [
  ["noon", 12],
  ["midday", 12],
  ["midnight", 0],
  ["morning", 9],
  ["afternoon", 14],
  ["evening", 18],
  ["tonight", 20],
  ["night", 20],
];

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function monthIndex(token: string): number {
  const t = token.slice(0, 3);
  if (token.length > 3 && !fullMonthName(token)) return -1;
  return MONTHS.indexOf(t);
}

function fullMonthName(token: string): boolean {
  return /^(january|february|march|april|may|june|july|august|september|sept|october|november|december)$/.test(
    token,
  );
}

/** 1–6 → afternoon, 7–11 → morning, 12 → noon, 13–23 → 24h clock. */
function bareHour(h: number): number {
  if (h >= 13 && h <= 23) return h;
  if (h === 12) return 12;
  if (h >= 1 && h <= 6) return h + 12;
  return h % 24;
}

function parseRelative(s: string): number | null {
  if (/^in half an? hour$|^half an? hour$/.test(s)) return 30 * 60_000;
  const m = s.match(
    /^(?:in )?(\d+(?:\.\d+)?|an?|one)\s?(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks)$/,
  );
  if (!m) return null;
  const n = m[1] === "a" || m[1] === "an" || m[1] === "one" ? 1 : Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2]!;
  const minute = 60_000;
  if (unit.startsWith("m")) return n * minute;
  if (unit.startsWith("h")) return n * 60 * minute;
  if (unit.startsWith("d")) return n * 24 * 60 * minute;
  return n * 7 * 24 * 60 * minute;
}

function addDaysTo(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseDay(
  s: string,
  today: Date,
  wallNow: Date,
  dateFormat: string | null | undefined,
  time: { h: number; m: number } | null,
): Date | null {
  const t = s.trim();
  if (t === "today") return today;
  if (/^(tomorrow|tmr|tmrw|tom)$/.test(t)) return addDaysTo(today, 1);
  if (t === "day after tomorrow") return addDaysTo(today, 2);
  if (t === "next week") {
    const diff = (1 - today.getDay() + 7) % 7 || 7;
    return addDaysTo(today, diff);
  }
  if (t === "weekend" || t === "this weekend") {
    const diff = (6 - today.getDay() + 7) % 7;
    return addDaysTo(today, diff);
  }
  const inDays = t.match(/^in (\d+) (days?|weeks?)$/);
  if (inDays) {
    const n = Number(inDays[1]);
    return addDaysTo(today, inDays[2]!.startsWith("w") ? n * 7 : n);
  }

  const wd = t.match(/^(next |this )?([a-z]+)$/);
  if (wd && WEEKDAYS[wd[2]!] != null) {
    const target = WEEKDAYS[wd[2]!]!;
    let diff = (target - today.getDay() + 7) % 7;
    if (diff === 0) {
      const laterToday =
        !wd[1] &&
        time != null &&
        time.h * 60 + time.m > wallNow.getHours() * 60 + wallNow.getMinutes();
      diff = laterToday ? 0 : 7;
    }
    return addDaysTo(today, diff);
  }

  // "jan 5", "january 5th 2027", "5 jan", "5th of january"
  const md =
    t.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/) ??
    null;
  const dm = t.match(
    /^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+)\.?(?: (\d{4}))?$/,
  );
  if (md || dm) {
    const monthToken = md ? md[1]! : dm![2]!;
    const dayNum = Number(md ? md[2] : dm![1]);
    const yearTok = md ? md[3] : dm![3];
    const mi = monthIndex(monthToken);
    if (mi < 0) return null;
    return resolveDate(today, mi, dayNum, yearTok ? Number(yearTok) : null);
  }

  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return resolveDate(today, Number(iso[2]) - 1, Number(iso[3]), Number(iso[1]));
  }

  const num = t.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (num) {
    const monthFirst = (dateFormat ?? "").startsWith("MM");
    const a = Number(num[1]);
    const b = Number(num[2]);
    const month = (monthFirst ? a : b) - 1;
    const dayNum = monthFirst ? b : a;
    let year: number | null = num[3] ? Number(num[3]) : null;
    if (year != null && year < 100) year += 2000;
    return resolveDate(today, month, dayNum, year);
  }
  return null;
}

function resolveDate(
  today: Date,
  month: number,
  day: number,
  year: number | null,
): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  let y = year ?? today.getFullYear();
  let d = new Date(y, month, day);
  if (d.getMonth() !== month) return null; // e.g. Feb 31
  if (year == null && d.getTime() < today.getTime()) {
    y += 1;
    d = new Date(y, month, day);
  }
  return d;
}

/** Falls back to UTC for an empty or unknown zone. */
export function safeTimezone(tz: string | null | undefined): string {
  const t = tz?.trim();
  if (!t) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: t });
    return t;
  } catch {
    return "UTC";
  }
}

/** "Tue 20 Oct, 9:00 AM" in the given zone. */
export function formatLongTime(
  at: Date,
  timezone: string,
  use24h: boolean,
): string {
  const tz = safeTimezone(timezone);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at);
  return `${date}, ${formatClock(at, tz, use24h)}`;
}

function formatClock(at: Date, tz: string, use24h: boolean): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: use24h ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: !use24h,
  }).format(at);
}

/**
 * Compact label for buttons: "Today 9:00 AM", "Tomorrow 18:30", "Tue 9:00",
 * "Oct 28, 9:00 AM" (more than 6 days away).
 */
export function formatShortTime(
  at: Date,
  timezone: string,
  use24h: boolean,
  now: Date = new Date(),
): string {
  const tz = safeTimezone(timezone);
  const wallAt = toZonedTime(at, tz);
  const wallNow = toZonedTime(now, tz);
  const dayA = new Date(wallAt.getFullYear(), wallAt.getMonth(), wallAt.getDate());
  const dayN = new Date(
    wallNow.getFullYear(),
    wallNow.getMonth(),
    wallNow.getDate(),
  );
  const diffDays = Math.round((dayA.getTime() - dayN.getTime()) / 86_400_000);
  const clock = formatClock(at, tz, use24h);
  if (diffDays === 0) return `Today ${clock}`;
  if (diffDays === 1) return `Tomorrow ${clock}`;
  if (diffDays > 1 && diffDays < 7) {
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    }).format(at);
    return `${wd} ${clock}`;
  }
  const md = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
  }).format(at);
  return `${md}, ${clock}`;
}

/** "Asia/Kolkata (GMT+5:30)". */
export function timezoneWithOffset(tz: string): string {
  const zone = safeTimezone(tz);
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const off = parts.find((p) => p.type === "timeZoneName")?.value;
    return off ? `${zone} (${off})` : zone;
  } catch {
    return zone;
  }
}

/** Wall-clock pieces of an instant in a zone, for the calendar + time inputs. */
export function wallParts(at: Date, tz: string) {
  const w = toZonedTime(at, safeTimezone(tz));
  return {
    year: w.getFullYear(),
    month: w.getMonth(),
    day: w.getDate(),
    hour: w.getHours(),
    minute: w.getMinutes(),
  };
}

/** Instant for a wall-clock date + time in a zone. */
export function fromWall(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return fromZonedTime(
    new Date(year, month, day, hour, minute, 0, 0),
    safeTimezone(tz),
  );
}
