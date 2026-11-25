import { describe, expect, it } from "vitest";
import { RESIZER_PLATFORMS, fitRect } from "./image-resizer";

describe("fitRect", () => {
  it("cover fills the canvas and crops the overflow evenly", () => {
    expect(fitRect(2000, 1000, 1080, 1080, "cover")).toEqual({ x: -540, y: 0, w: 2160, h: 1080 });
  });
  it("contain fits inside and centers with bars", () => {
    expect(fitRect(2000, 1000, 1080, 1080, "contain")).toEqual({ x: 0, y: 270, w: 1080, h: 540 });
  });
});

describe("presets", () => {
  it("have unique slugs and positive sizes", () => {
    expect(new Set(RESIZER_PLATFORMS.map((p) => p.slug)).size).toBe(RESIZER_PLATFORMS.length);
    for (const p of RESIZER_PLATFORMS) for (const f of p.formats) expect(f.w > 0 && f.h > 0).toBe(true);
  });
});
