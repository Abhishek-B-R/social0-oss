import { describe, expect, it } from "vitest";
import {
  computeBulkSchedule,
  formatSchedulePreview,
  patternFitsInDay,
} from "./bulk-schedule";

const hhmm = (d: Date) =>
  `${String(d.getDate())} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("computeBulkSchedule", () => {
  const start = new Date(2026, 0, 10);

  it("never places a post before the first-post time", () => {
    const dates = computeBulkSchedule(6, start, 22, 0, 3, 2);
    expect(dates.map(hhmm)).toEqual([
      "10 22:00",
      "11 00:00",
      "11 02:00",
      "11 22:00",
      "12 00:00",
      "12 02:00",
    ]);
  });

  it("keeps same-day patterns unchanged", () => {
    const dates = computeBulkSchedule(4, start, 9, 30, 2, 0.5);
    expect(dates.map(hhmm)).toEqual(["10 09:30", "10 10:00", "11 09:30", "11 10:00"]);
  });

  it("never stacks two posts on the same minute, even for a pattern that doesn't fit", () => {
    const dates = computeBulkSchedule(18, start, 9, 0, 6, 6);
    const times = dates.map((d) => d.getTime());
    expect(new Set(times).size).toBe(times.length);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(dates[0]?.getHours()).toBe(9);
  });
});

describe("patternFitsInDay", () => {
  it("rejects a day whose posts run into the next day's first post", () => {
    expect(patternFitsInDay(6, 6)).toBe(false);
    expect(patternFitsInDay(4, 6)).toBe(true);
    expect(patternFitsInDay(24, 0.5)).toBe(true);
    expect(patternFitsInDay(1, 24)).toBe(true);
  });
});

describe("formatSchedulePreview", () => {
  it("matches the real times and marks the ones after midnight", () => {
    expect(formatSchedulePreview(3, "22:00", 3, 2)).toBe(
      "Daily schedule (2h apart): 22:00 → 00:00 (next day) → 02:00 (next day)\nTotal duration: ~1 day",
    );
  });
});
