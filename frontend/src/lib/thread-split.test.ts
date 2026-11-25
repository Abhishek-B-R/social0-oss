import { describe, expect, it } from "vitest";
import { postCharCount } from "./platform-limits";
import { splitThread } from "./thread-split";

const X = { platform: "twitter_x", limit: 280, numbered: false, breakOnBlankLines: false };
const long = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i + 1} about shipping.`).join(" ");

describe("splitThread", () => {
  it("keeps short text as one post", () => {
    expect(splitThread("Hello there.", X)).toEqual(["Hello there."]);
  });
  it("splits at sentence ends and every post fits", () => {
    const posts = splitThread(long, X);
    expect(posts.length).toBeGreaterThan(1);
    for (const p of posts) {
      expect(postCharCount(p, "twitter_x")).toBeLessThanOrEqual(280);
      expect(p.endsWith(".")).toBe(true);
    }
    expect(posts.join(" ")).toBe(long);
  });
  it("numbers posts and still fits the limit", () => {
    const posts = splitThread(long, { ...X, numbered: true });
    expect(posts[0]).toMatch(/ 1\/\d+$/);
    for (const p of posts) expect(postCharCount(p, "twitter_x")).toBeLessThanOrEqual(280);
  });
  it("breaks a giant word by characters", () => {
    const posts = splitThread("a".repeat(600), X);
    expect(posts.map((p) => p.length)).toEqual([280, 280, 40]);
  });
  it("starts a new post at blank lines when asked", () => {
    expect(splitThread("One.\n\nTwo.", { ...X, breakOnBlankLines: true })).toEqual(["One.", "Two."]);
    expect(splitThread("One.\n\nTwo.", X)).toEqual(["One.\n\nTwo."]);
  });
  it("counts links as 23 on X", () => {
    const url = "https://example.com/" + "x".repeat(300);
    expect(splitThread(`Read this ${url}`, X)).toHaveLength(1);
  });
});
