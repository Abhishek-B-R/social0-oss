import { describe, expect, it } from "vitest";
import {
  buildPlatformChartModel,
  niceAxisMax,
} from "./chart-pipeline";

describe("niceAxisMax", () => {
  it("returns a short ceiling for tiny integers", () => {
    expect(niceAxisMax([0, 0, 8])).toBe(10);
    expect(niceAxisMax([1, 3])).toBe(5);
    expect(niceAxisMax([])).toBe(4);
  });

  it("rounds larger values to readable ticks", () => {
    expect(niceAxisMax([47])).toBe(50);
    expect(niceAxisMax([120])).toBe(150);
  });
});

describe("buildPlatformChartModel", () => {
  it("drops all-zero platforms so empty columns do not shrink bars", () => {
    const model = buildPlatformChartModel([
      {
        platform: "youtube",
        label: "YouTube",
        views: 8,
        likes: 1,
        comments: 7,
        shares: 0,
      },
      {
        platform: "pinterest",
        label: "Pinterest",
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
      },
    ]);
    expect(model.rows.map((r) => r.platform)).toEqual(["youtube"]);
    expect(model.activeSeries.map((s) => s.key)).toEqual([
      "views",
      "likes",
      "comments",
    ]);
  });
});
