const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

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

export function parseNaturalTime(input: string, timezone = "default"): string {
  const trimmed = input.trim().toLowerCase();
  const now = new Date();

  // ISO format passthrough
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    if (trimmed.includes("t")) {
      return trimmed.endsWith("z") || trimmed.includes("+")
        ? trimmed
        : `${trimmed}+${timezone === "default" ? "default" : timezone}`;
    }
    const timePart = trimmed.match(/\d{2}:\d{2}/);
    if (timePart) {
      return `${trimmed.replace(/\s+\d{2}:\d{2}/, "")}T${timePart[0]}:00+${timezone === "default" ? "default" : timezone}`;
    }
  }

  let target = new Date(now);

  if (trimmed === "now") {
    return now.toISOString();
  }

  if (trimmed.startsWith("today")) {
    target = new Date(now);
    const time = parseTimePart(trimmed.replace("today", "").trim());
    if (time) {
      target.setHours(time.hours, time.minutes, 0, 0);
    }
  } else if (trimmed.startsWith("tomorrow")) {
    target = new Date(now);
    target.setDate(target.getDate() + 1);
    const time = parseTimePart(trimmed.replace("tomorrow", "").replace(/-/g, " ").trim());
    if (time) {
      target.setHours(time.hours, time.minutes, 0, 0);
    } else {
      target.setHours(9, 0, 0, 0);
    }
  } else if (trimmed.startsWith("next ")) {
    const day = trimmed.replace("next ", "").split(/\s+/)[0];
    target = nextWeekday(now, day);
    const time = parseTimePart(trimmed.replace(`next ${day}`, "").trim());
    if (time) {
      target.setHours(time.hours, time.minutes, 0, 0);
    } else {
      target.setHours(9, 0, 0, 0);
    }
  } else {
    const time = parseTimePart(trimmed);
    if (time) {
      target.setHours(time.hours, time.minutes, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
    } else {
      throw new Error(`Unable to parse time: "${input}"`);
    }
  }

  const iso = target.toISOString().slice(0, 19);
  return timezone === "default" ? `${iso}+default` : `${iso}`;
}

export function formatScheduleHelp(): string {
  return [
    "Examples:",
    "  today 8pm",
    "  tomorrow",
    "  tomorrow 9am",
    "  next monday",
    "  2026-08-01 14:00",
  ].join("\n");
}
