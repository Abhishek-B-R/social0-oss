import { describe, expect, it } from "vitest";
import { inDateWindow, parseDateWindow } from "../lib/date-window.js";
import { startOfDay, subDays } from "date-fns";

describe("parseDateWindow", () => {
  it("defaults to 7d", () => {
    const w = parseDateWindow({});
    expect(w.range).toBe("7d");
    const expectedSince = startOfDay(subDays(w.until, 6));
    expect(w.since.getTime()).toBe(expectedSince.getTime());
  });

  it("maps legacy 1d → 7d and 30d → 28d", () => {
    expect(parseDateWindow({ range: "1d" }).range).toBe("7d");
    expect(parseDateWindow({ range: "30d" }).range).toBe("28d");
  });

  it("accepts 14d / 28d / 90d / 365d", () => {
    expect(parseDateWindow({ range: "14d" }).range).toBe("14d");
    expect(parseDateWindow({ range: "28d" }).range).toBe("28d");
    expect(parseDateWindow({ range: "90d" }).range).toBe("90d");
    expect(parseDateWindow({ range: "365d" }).range).toBe("365d");
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

  it("keeps undated items", () => {
    expect(inDateWindow(null, since, until)).toBe(true);
  });

  it("includes timestamps on the edges", () => {
    expect(inDateWindow("2026-08-01T00:00:00.000Z", since, until)).toBe(true);
    expect(inDateWindow("2026-08-17T00:00:00.000Z", since, until)).toBe(true);
    expect(inDateWindow("2026-07-31T23:59:59.000Z", since, until)).toBe(false);
  });
});
