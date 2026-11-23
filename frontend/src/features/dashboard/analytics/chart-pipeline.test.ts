import { describe, expect, it } from "vitest";
import { axisTick, chartDayTick } from "./chart-pipeline";

describe("axisTick", () => {
  it("rounds small values and compacts thousands", () => {
    expect(axisTick(7.6)).toBe("8");
    expect(axisTick(1500)).toBe("1.5K");
    expect(axisTick(2_000_000)).toBe("2.0M");
  });

  it("uses billions and rolls over instead of printing 1000.0K", () => {
    expect(axisTick(3_703_700_000)).toBe("3.7B");
    expect(axisTick(999_960)).toBe("1.0M");
    expect(axisTick(999_400)).toBe("999.4K");
  });

  it("returns an empty label for non-finite values", () => {
    expect(axisTick(Number.NaN)).toBe("");
    expect(axisTick(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("chartDayTick", () => {
  it("shows month and day for short ranges", () => {
    expect(chartDayTick("2026-03-04", 30)).toBe("Mar 4");
    expect(chartDayTick("2026-03-04T23:59:00Z", 30)).toBe("Mar 4");
  });

  it("shows only the month for ranges over 180 days", () => {
    expect(chartDayTick("2026-03-04", 365)).toBe("Mar");
  });

  it("returns an empty label for invalid dates", () => {
    expect(chartDayTick("not-a-date", 30)).toBe("");
  });
});
