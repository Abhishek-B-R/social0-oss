import { describe, expect, it } from "vitest";
import { parseInline, plainText, slugifyHeading } from "./rich-text";

describe("parseInline", () => {
  it("returns a single text node when there is no markup", () => {
    expect(parseInline("plain copy")).toEqual([
      { type: "text", value: "plain copy" },
    ]);
  });

  it("parses bold, code, and links in one pass", () => {
    expect(
      parseInline("Use **X** via `POST /v1/posts` — see [docs](/tools/api)."),
    ).toEqual([
      { type: "text", value: "Use " },
      { type: "strong", value: "X" },
      { type: "text", value: " via " },
      { type: "code", value: "POST /v1/posts" },
      { type: "text", value: " — see " },
      { type: "link", value: "docs", href: "/tools/api" },
      { type: "text", value: "." },
    ]);
  });

  it("keeps an unterminated marker as literal text", () => {
    expect(parseInline("2 ** 3 is not bold")).toEqual([
      { type: "text", value: "2 ** 3 is not bold" },
    ]);
  });

  it("handles an empty string", () => {
    expect(parseInline("")).toEqual([]);
  });

  it("does not treat a bracket without a URL as a link", () => {
    expect(parseInline("array[0] stays literal")).toEqual([
      { type: "text", value: "array[0] stays literal" },
    ]);
  });

  it("parses adjacent markers without dropping characters", () => {
    expect(parseInline("**a**`b`")).toEqual([
      { type: "strong", value: "a" },
      { type: "code", value: "b" },
    ]);
  });
});

describe("plainText", () => {
  it("strips markers but keeps the visible words", () => {
    expect(plainText("**Bold** and [linked](/blog) and `code`")).toBe(
      "Bold and linked and code",
    );
  });
});

describe("slugifyHeading", () => {
  it("builds a url-safe anchor", () => {
    expect(slugifyHeading("Why **scheduled** posts fail (2026)")).toBe(
      "why-scheduled-posts-fail-2026",
    );
  });

  it("collapses repeated separators and trims edges", () => {
    expect(slugifyHeading("  X (Twitter) — limits  ")).toBe("x-twitter-limits");
  });
});
