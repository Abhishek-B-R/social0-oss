const MINUTES_IN_DAY = 24 * 60;

function gapToMinutes(gapHours: number): number {
  return Math.round(gapHours * 60);
}

/**
 * True when `videosPerDay` posts `gapHours` apart all start before the next
 * day's first post (same clock time, one day later). A pattern that doesn't
 * fit would land a day's later posts on top of the next day's.
 */
export function patternFitsInDay(videosPerDay: number, gapHours: number): boolean {
  return Math.max(0, videosPerDay - 1) * gapToMinutes(gapHours) < MINUTES_IN_DAY;
}

/**
 * Gap actually used between a day's posts. Callers should only pass patterns
 * that fit (`patternFitsInDay`); a gap that would run into the next day's
 * first post is narrowed so slots never collide or fall out of order.
 */
function dayGapMinutes(videosPerDay: number, gapHours: number): number {
  const gap = Math.max(0, gapToMinutes(gapHours));
  if (videosPerDay <= 1 || patternFitsInDay(videosPerDay, gapHours)) return gap;
  return Math.floor((MINUTES_IN_DAY - 1) / (videosPerDay - 1));
}

/**
 * Compute scheduled datetimes for bulk upload.
 * Each day starts at the chosen start time and its posts follow `gapHours`
 * apart, running past midnight when they need to (21:00, 23:00, 01:00 next
 * day). The next day starts at the start time again. Nothing is ever placed
 * before the chosen first-post time.
 */
export function computeBulkSchedule(
  count: number,
  startDate: Date,
  startTimeHours: number,
  startTimeMinutes: number,
  videosPerDay: number,
  gapHours: number,
): Date[] {
  const result: Date[] = [];
  const perDay = Math.max(1, videosPerDay);
  const gapMinutes = dayGapMinutes(perDay, gapHours);
  const startMinutes = (startTimeHours ?? 0) * 60 + (startTimeMinutes ?? 0);

  for (let i = 0; i < count; i++) {
    const dayIndex = Math.floor(i / perDay);
    const slotInDay = i % perDay;
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayIndex);
    // setHours normalizes minutes past 24:00 onto the following day in local
    // time, so a slot after midnight keeps its wall-clock time across DST.
    d.setHours(0, startMinutes + slotInDay * gapMinutes, 0, 0);
    result.push(d);
  }

  return result;
}

/** Format schedule for preview: "Daily schedule (2h apart): 21:00 → 23:00 → 01:00 (next day)" and "Total duration: ~4 days" */
export function formatSchedulePreview(
  count: number,
  startTimeStr: string,
  videosPerDay: number,
  gapHours: number,
): string {
  if (count === 0) return "";

  const [h, m] = startTimeStr.split(":").map(Number);
  const times: string[] = [];
  const perDay = Math.max(1, videosPerDay);
  // Work in total minutes from midnight so 0.5h = +30 mins, not +0.5 to the hour
  const gapMinutes = dayGapMinutes(perDay, gapHours);
  const startMinutes = (h ?? 0) * 60 + (m ?? 0);

  for (let i = 0; i < Math.min(perDay, count); i++) {
    const slotMinutes = startMinutes + i * gapMinutes;
    const inDay = slotMinutes % MINUTES_IN_DAY;
    const hour = Math.floor(inDay / 60);
    const minute = inDay % 60;
    const nextDay = slotMinutes >= MINUTES_IN_DAY ? " (next day)" : "";
    times.push(
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}${nextDay}`,
    );
  }

  const totalDays = Math.ceil(count / perDay);
  const gapLabel =
    gapHours === 24
      ? "24h apart"
      : gapHours === 1
        ? "1h apart"
        : `${gapHours}h apart`;
  return `Daily schedule (${gapLabel}): ${times.join(" → ")}\nTotal duration: ~${totalDays} day${totalDays === 1 ? "" : "s"}`;
}
