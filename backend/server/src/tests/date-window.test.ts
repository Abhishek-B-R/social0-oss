import { describe, expect, it } from "vitest";
import {
  calendarDayKey,
  inDateWindow,
  parseDateWindow,
} from "../lib/date-window.js";
import { toZonedTime } from "date-fns-tz";

describe("parseDateWindow", () => {
  it("defaults to 7d starting at timezone midnight", () => {
    const w = parseDateWindow({}, "UTC");
    expect(w.range).toBe("7d");
    const z = toZonedTime(w.since, "UTC");
    expect(z.getHours()).toBe(0);
    expect(z.getMinutes()).toBe(0);
    expect(calendarDayKey(w.until, "UTC")).not.toBe("");
  });

  it("uses the given IANA zone, not process TZ", () => {
    const w = parseDateWindow({ range: "7d" }, "Asia/Kolkata");
    const z = toZonedTime(w.since, "Asia/Kolkata");
    expect(z.getHours()).toBe(0);
    expect(z.getMinutes()).toBe(0);
    const untilZ = toZonedTime(w.until, "Asia/Kolkata");
    const span =
      (Date.UTC(untilZ.getFullYear(), untilZ.getMonth(), untilZ.getDate()) -
        Date.UTC(z.getFullYear(), z.getMonth(), z.getDate())) /
      86_400_000;
    expect(span).toBe(6);
  });

  it("maps legacy 1d to 7d and 30d to 28d", () => {
    expect(parseDateWindow({ range: "1d" }).range).toBe("7d");
    expect(parseDateWindow({ range: "30d" }).range).toBe("28d");
  });

  it("accepts 14d / 28d / 90d / 365d", () => {
    expect(parseDateWindow({ range: "14d" }).range).toBe("14d");
    expect(parseDateWindow({ range: "28d" }).range).toBe("28d");
    expect(parseDateWindow({ range: "90d" }).range).toBe("90d");
    expect(parseDateWindow({ range: "365d" }).range).toBe("365d");
  });

  it("does not startOfDay custom ISO a second time", () => {
    const since = "2026-08-12T04:30:00.000Z";
    const until = "2026-08-18T12:00:00.000Z";
    const w = parseDateWindow(
      { range: "custom", since, until },
      "Asia/Kolkata",
    );
    expect(w.since.toISOString()).toBe(since);
  });

  it("caps custom windows at 365 days", () => {
    const until = new Date();
    const since = new Date(until.getTime() - 800 * 24 * 60 * 60 * 1000);
    const w = parseDateWindow({
      range: "custom",
      since: since.toISOString(),
      until: until.toISOString(),
    });
    expect(w.range).toBe("custom");
    expect(w.until.getTime() - w.since.getTime()).toBe(365 * 24 * 60 * 60 * 1000);
  });
});

describe("inDateWindow", () => {
  const since = new Date("2026-08-01T00:00:00.000Z");
  const until = new Date("2026-08-17T00:00:00.000Z");

  it("keeps undated items by default (comments)", () => {
    expect(inDateWindow(null, since, until)).toBe(true);
  });

  it("excludes undated when keepUndated is false (DMs)", () => {
    expect(inDateWindow(null, since, until, { keepUndated: false })).toBe(false);
    expect(inDateWindow("not-a-date", since, until, { keepUndated: false })).toBe(
      false,
    );
  });

  it("includes timestamps on the edges", () => {
    expect(inDateWindow("2026-08-01T00:00:00.000Z", since, until)).toBe(true);
    expect(inDateWindow("2026-08-17T00:00:00.000Z", since, until)).toBe(true);
    expect(inDateWindow("2026-07-31T23:59:59.000Z", since, until)).toBe(false);
  });
});
