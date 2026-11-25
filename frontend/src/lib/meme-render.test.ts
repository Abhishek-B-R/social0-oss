import { describe, expect, it } from "vitest";
import { barHeight, memeSize, topBottom, wrapLines } from "./meme-render";

const m = (t: string) => t.length * 10;

describe("wrapLines", () => {
  it("wraps by width and keeps line breaks", () => {
    expect(wrapLines("aa bb cc dd", 50, m)).toEqual(["aa bb", "cc dd"]);
    expect(wrapLines("one\ntwo", 500, m)).toEqual(["one", "two"]);
  });
  it("returns nothing for an empty caption", () => {
    expect(wrapLines("  ", 100, m)).toEqual([]);
  });
});

describe("layout", () => {
  it("has no bar without a caption", () => {
    expect(barHeight(0, 40)).toBe(0);
  });
  it("grows the bar with more lines and keeps the height even", () => {
    const one = memeSize({ style: "bar", theme: "white", size: 100, caption: "short", watermark: false }, 1280, 720, 720, m);
    const many = memeSize({ style: "bar", theme: "white", size: 100, caption: "word ".repeat(60), watermark: false }, 1280, 720, 720, m);
    expect(one.mediaH).toBe(405);
    expect(many.bar).toBeGreaterThan(one.bar);
    expect(many.height % 2).toBe(0);
  });
  it("puts no bar on top-and-bottom memes", () => {
    expect(memeSize({ style: "impact", theme: "white", size: 100, caption: "x", watermark: false }, 100, 100, 720, m).bar).toBe(0);
  });
  it("splits classic meme text at the first sentence or line", () => {
    expect(topBottom("When the build passes. On the first try")).toEqual(["When the build passes.", "On the first try"]);
    expect(topBottom("top\nbottom")).toEqual(["top", "bottom"]);
  });
});
