import { addDays, getDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export type QueueSlot = {
  id: string;
  userId: string;
  daysOfWeek: number[];
  hour: number;
  minute: number;
  isActive: boolean;
};

/**
 * Get the next occurrence of (dayOfWeek, hour, minute) in the given timezone
 * on or after fromDate, as a UTC Date.
 * dayOfWeek: 0=Sun, 1=Mon ... 6=Sat
 */
function slotToNextUTCDateSingle(
  dayOfWeek: number,
  hour: number,
  minute: number,
  timezone: string,
  fromDate: Date,
): Date {
  const fromInTz = toZonedTime(fromDate, timezone);
  const fromDay = getDay(fromInTz);
  const fromTime = fromInTz.getHours() * 60 + fromInTz.getMinutes();
  const slotTimeMinutes = hour * 60 + minute;

  let daysAhead = dayOfWeek - fromDay;
  if (daysAhead < 0) daysAhead += 7;
  if (daysAhead === 0 && slotTimeMinutes <= fromTime) daysAhead += 7;

  const y = fromInTz.getFullYear();
  const m = fromInTz.getMonth();
  const d = fromInTz.getDate();
  const nextLocal = addDays(new Date(y, m, d), daysAhead);
  const candidate = new Date(
    nextLocal.getFullYear(),
    nextLocal.getMonth(),
    nextLocal.getDate(),
    hour,
    minute,
    0,
    0,
  );
  return fromZonedTime(candidate, timezone);
}

/**
 * Get the next occurrence of this slot (any of its daysOfWeek) at hour:minute
 * in the given timezone on or after fromDate, as a UTC Date.
 * daysOfWeek: array of 0-6 (0=Sun ... 6=Sat), e.g. [1,2,3,4,5] for Mon–Fri
 */
export function slotToNextUTCDate(
  daysOfWeek: number[],
  hour: number,
  minute: number,
  timezone: string,
  fromDate: Date,
): Date {
  if (daysOfWeek.length === 0) {
    return addDays(fromDate, 365);
  }
  let next: Date | null = null;
  for (const day of daysOfWeek) {
    const candidate = slotToNextUTCDateSingle(day, hour, minute, timezone, fromDate);
    if (!next || candidate.getTime() < next.getTime()) next = candidate;
  }
  return next!;
}

/**
 * Find the next available slot time (UTC) that is not in occupiedSlots.
 * Slots are considered in chronological order of next occurrence; returns the first that is not taken.
 * Returns both the UTC time and the slot id so the caller can record the queue assignment.
 */
export function getNextAvailableSlot(
  slots: QueueSlot[],
  occupiedSlots: Date[],
  userTimezone: string,
  fromDate: Date = new Date(),
): { utc: Date; slotId: string } | null {
  const activeSlots = slots.filter((s) => s.isActive && (s.daysOfWeek?.length ?? 0) > 0);
  if (activeSlots.length === 0) return null;

  const normalizeUtc = (d: Date) => Math.floor(d.getTime() / 60_000) * 60_000;
  const occupiedSet = new Set(occupiedSlots.map(normalizeUtc));

  type Candidate = { utc: Date; slot: QueueSlot };
  const nextForSlot = (slot: QueueSlot, after: Date): Candidate => ({
    utc: slotToNextUTCDate(slot.daysOfWeek, slot.hour, slot.minute, userTimezone, after),
    slot,
  });

  const heap: Candidate[] = activeSlots.map((s) => nextForSlot(s, fromDate));
  heap.sort((a, b) => a.utc.getTime() - b.utc.getTime());

  const maxIterations = 500;
  for (let i = 0; i < maxIterations && heap.length > 0; i++) {
    const first = heap.shift()!;
    if (!occupiedSet.has(normalizeUtc(first.utc)))
      return { utc: first.utc, slotId: first.slot.id };
    heap.push(nextForSlot(first.slot, addDays(first.utc, 1)));
    heap.sort((a, b) => a.utc.getTime() - b.utc.getTime());
  }
  return null;
}
