const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a local Date as wall-clock ISO without UTC conversion. */
export function formatLocalWallClock(date: Date, timezone = "default"): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const base = `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
  return timezone === "default" ? `${base}+default` : base;
}

function parseTimePart(input: string): { hours: number; minutes: number } | null {
  const match = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const ampm = match[3]?.toLowerCase();
  if (ampm === "pm" && hours < 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;
  return { hours, minutes };
}

function nextWeekday(from: Date, dayName: string): Date {
  const target = DAYS.indexOf(dayName.toLowerCase());
  if (target < 0) throw new Error(`Unknown day: ${dayName}`);
  const d = new Date(from);
  const current = d.getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function applyTime(target: Date, time: { hours: number; minutes: number } | null, fallbackHour = 9): void {
  if (time) {
    target.setHours(time.hours, time.minutes, 0, 0);
  } else {
    target.setHours(fallbackHour, 0, 0, 0);
  }
}

/** Parse relative phrases like "in 2 hours" / "in 3 days at 3pm". */
function parseRelative(trimmed: string, now: Date): Date | null {
  const match = trimmed.match(
    /^in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)(?:\s+at\s+(.+))?$/i,
  );
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const atPart = match[3]?.trim();
  const target = new Date(now);

  if (unit.startsWith("min")) {
    target.setMinutes(target.getMinutes() + amount);
  } else if (unit.startsWith("hour") || unit.startsWith("hr")) {
    target.setHours(target.getHours() + amount);
  } else {
    target.setDate(target.getDate() + amount);
    if (atPart) {
      const time = parseTimePart(atPart);
      if (!time) throw new Error(`Unable to parse time in: "${trimmed}"`);
      applyTime(target, time);
    }
  }

  return target;
}

export function parseNaturalTime(input: string, timezone = "default"): string {
  const trimmed = input.trim().toLowerCase();
  const now = new Date();

  // ISO / date passthrough — preserve wall-clock components
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    if (trimmed.includes("t")) {
      return trimmed.endsWith("z") || /[+-]\d{2}:?\d{2}$/.test(trimmed) || trimmed.endsWith("+default")
        ? trimmed
        : `${trimmed}+${timezone === "default" ? "default" : timezone}`;
    }
    const timePart = trimmed.match(/\b(\d{1,2}):(\d{2})\b/);
    if (timePart) {
      const dateOnly = trimmed.replace(/\s+\d{1,2}:\d{2}.*$/, "").trim();
      return `${dateOnly}T${pad2(Number(timePart[1]))}:${timePart[2]}:00+${timezone === "default" ? "default" : timezone}`;
    }
  }

  if (trimmed === "now") {
    return formatLocalWallClock(now, timezone);
  }

  const relative = parseRelative(trimmed, now);
  if (relative) {
    if (relative <= now) {
      throw new Error(`Scheduled time must be in the future: "${input}"`);
    }
    return formatLocalWallClock(relative, timezone);
  }

  let target = new Date(now);

  if (trimmed.startsWith("today")) {
    target = new Date(now);
    applyTime(target, parseTimePart(trimmed.replace("today", "").trim()), now.getHours());
  } else if (trimmed.startsWith("tomorrow")) {
    target = new Date(now);
    target.setDate(target.getDate() + 1);
    applyTime(target, parseTimePart(trimmed.replace("tomorrow", "").replace(/-/g, " ").trim()));
  } else if (trimmed.startsWith("next ")) {
    const day = trimmed.replace("next ", "").split(/\s+/)[0];
    target = nextWeekday(now, day);
    applyTime(target, parseTimePart(trimmed.replace(`next ${day}`, "").trim()));
  } else {
    const time = parseTimePart(trimmed);
    if (time) {
      applyTime(target, time);
      if (target <= now) target.setDate(target.getDate() + 1);
    } else {
      throw new Error(`Unable to parse time: "${input}"`);
    }
  }

  return formatLocalWallClock(target, timezone);
}

export function formatScheduleHelp(): string {
  return [
    "Examples:",
    "  today 8pm",
    "  tomorrow",
    "  tomorrow 9am",
    "  next monday",
    "  in 2 hours",
    "  in 2 days at 3pm",
    "  2026-08-01 14:00",
  ].join("\n");
}
