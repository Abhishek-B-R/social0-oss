import { describe, expect, it } from "vitest";
import { postCharCount, xWeightedLength } from "./platform-limits";

describe("xWeightedLength", () => {
  it("counts plain Latin text 1 per character", () => {
    expect(xWeightedLength("hello world")).toBe(11);
  });
  it("counts any link as 23", () => {
    expect(xWeightedLength("see https://social0.app/free-tools/post-preview/x")).toBe(4 + 23);
    expect(xWeightedLength("social0.app")).toBe(23);
  });
  it("counts emoji and CJK as 2", () => {
    expect(xWeightedLength("👍")).toBe(2);
    expect(xWeightedLength("👨‍👩‍👧")).toBe(2);
    expect(xWeightedLength("日本")).toBe(4);
  });
});

describe("postCharCount", () => {
  it("counts visible characters on other platforms", () => {
    expect(postCharCount("👨‍👩‍👧 hi", "bluesky")).toBe(4);
    expect(postCharCount("social0.app", "linkedin")).toBe(11);
  });
});
