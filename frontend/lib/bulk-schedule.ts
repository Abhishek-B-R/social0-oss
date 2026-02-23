/**
 * Compute scheduled datetimes for bulk upload.
 * Slots per day: startTime, startTime+gapHours, ... (videosPerDay times), all on same calendar day.
 * Then next day at startTime again.
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
  const msPerGap = gapHours * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const dayIndex = Math.floor(i / videosPerDay);
    const slotInDay = i % videosPerDay;
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayIndex);
    d.setHours(startTimeHours, startTimeMinutes, 0, 0);
    d.setTime(d.getTime() + slotInDay * msPerGap);
    result.push(d);
  }

  return result;
}

/** Format schedule for preview: "Daily schedule (2h apart): 19:00 → 21:00 → 23:00" and "Total duration: ~4 days" */
export function formatSchedulePreview(
  count: number,
  startTimeStr: string,
  videosPerDay: number,
  gapHours: number,
): string {
  if (count === 0) return "";

  const [h, m] = startTimeStr.split(":").map(Number);
  const times: string[] = [];
  let hour = h ?? 0;
  let minute = m ?? 0;
  for (let i = 0; i < Math.min(videosPerDay, count); i++) {
    times.push(
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    );
    hour += gapHours;
    if (hour >= 24) hour -= 24;
  }

  const totalDays = Math.ceil(count / videosPerDay);
  const gapLabel =
    gapHours === 24
      ? "24h apart"
      : gapHours === 1
        ? "1h apart"
        : `${gapHours}h apart`;
  return `Daily schedule (${gapLabel}): ${times.join(" → ")}\nTotal duration: ~${totalDays} day${totalDays === 1 ? "" : "s"}`;
}
