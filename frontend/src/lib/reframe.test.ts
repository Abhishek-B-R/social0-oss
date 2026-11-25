import { describe, expect, it } from "vitest";
import { TARGETS, reframeLayout } from "./reframe";

describe("reframeLayout", () => {
  it("fits a landscape clip into 9:16 with a full-frame blurred background", () => {
    const L = reframeLayout(1920, 1080, 720, 1280, "blur");
    expect(L.fg).toEqual({ x: 0, y: 437.5, w: 720, h: 405 });
    expect(L.bg!.h).toBe(1280);
    expect(L.bg!.w).toBeCloseTo(2275.56, 1);
  });
  it("crops to fill and lets pos pick the side", () => {
    const left = reframeLayout(1920, 1080, 720, 1280, "crop", 0);
    const right = reframeLayout(1920, 1080, 720, 1280, "crop", 1);
    expect(left.fg.x).toBeCloseTo(0);
    expect(right.fg.x + right.fg.w).toBeCloseTo(720);
    expect(left.bg).toBeNull();
  });
  it("leaves the colour mode without a blurred copy", () => {
    expect(reframeLayout(1080, 1920, 1280, 720, "color").bg).toBeNull();
  });
  it("uses even output sizes for H.264", () => {
    for (const t of TARGETS) expect(t.w % 2 + t.h % 2).toBe(0);
  });
});
