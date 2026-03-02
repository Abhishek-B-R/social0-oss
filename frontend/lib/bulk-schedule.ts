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
  const gapMinutes = Math.round(gapHours * 60);
  const startMinutes = (startTimeHours ?? 0) * 60 + (startTimeMinutes ?? 0);
  const minutesInDay = 24 * 60;
  const spanMinutes = Math.max(0, (videosPerDay - 1) * gapMinutes);
  const spillsToNextDay = startMinutes + spanMinutes >= minutesInDay;

  for (let i = 0; i < count; i++) {
    const dayIndex = Math.floor(i / videosPerDay);
    const slotInDay = i % videosPerDay;
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayIndex);
    const slotMinutes = spillsToNextDay
      ? // Keep all slots within the same calendar day by scheduling backwards
        // from the chosen start time (which becomes the latest slot of that day).
        startMinutes - (videosPerDay - 1 - slotInDay) * gapMinutes
      : startMinutes + slotInDay * gapMinutes;

    const clamped = Math.max(0, Math.min(minutesInDay - 1, slotMinutes));
    const hh = Math.floor(clamped / 60);
    const mm = clamped % 60;
    d.setHours(hh, mm, 0, 0);
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
  // Work in total minutes from midnight so 0.5h = +30 mins, not +0.5 to the hour
  const gapMinutes = Math.round(gapHours * 60);
  const startMinutes = (h ?? 0) * 60 + (m ?? 0);
  const minutesInDay = 24 * 60;
  const spanMinutes = Math.max(0, (videosPerDay - 1) * gapMinutes);
  const spillsToNextDay = startMinutes + spanMinutes >= minutesInDay;

  for (let i = 0; i < Math.min(videosPerDay, count); i++) {
    const slotMinutes = spillsToNextDay
      ? startMinutes - (videosPerDay - 1 - i) * gapMinutes
      : startMinutes + i * gapMinutes;
    const clamped = Math.max(0, Math.min(minutesInDay - 1, slotMinutes));
    const hour = Math.floor(clamped / 60) % 24;
    const minute = clamped % 60;
    times.push(
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    );
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
