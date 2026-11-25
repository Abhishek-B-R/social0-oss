import { describe, expect, it } from "vitest";
import { splitTiles } from "./split-image";

describe("splitTiles", () => {
  it("lays out a 3x2 grid and posts bottom-right first", () => {
    const t = splitTiles(3, 2, 1080, 1440);
    expect(t).toHaveLength(6);
    expect(t[0]).toMatchObject({ x: 0, y: 0, order: 6 });
    expect(t[5]).toMatchObject({ x: 2160, y: 1440, order: 1 });
  });
  it("splits a carousel left to right as one row", () => {
    const t = splitTiles(4, 1, 1080, 1350);
    expect(t.map((x) => x.x)).toEqual([0, 1080, 2160, 3240]);
  });
});
