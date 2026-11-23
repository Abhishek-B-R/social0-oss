import { describe, it, expect, vi } from "vitest";
import {
  buildAliases,
  formatAccountLabel,
  resolveAliasToId,
  resolveAccountRefs,
  resolvePlatformToIds,
  formatPlatformName,
} from "../src/utils/aliases.js";
import type { ConnectedAccount } from "../src/types/index.js";
import { parseNaturalTime } from "../src/utils/dates.js";
import { parseMarkdownFrontMatter } from "../src/utils/files.js";
import { guessMimeType } from "../src/utils/files.js";

const mockAccounts: ConnectedAccount[] = [
  {
    id: "uuid-twitter",
    platform: "twitter_x",
    username: "social0",
    profile_image_url: null,
    is_active: true,
    token_expires_at: null,
    token_status: "active",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "uuid-linkedin",
    platform: "linkedin",
    username: "social0-co",
    profile_image_url: null,
    is_active: true,
    token_expires_at: null,
    token_status: "active",
    created_at: "2026-01-02T00:00:00Z",
  },
  {
    id: "uuid-instagram",
    platform: "instagram",
    username: "social0app",
    profile_image_url: null,
    is_active: true,
    token_expires_at: null,
    token_status: "expired",
    created_at: "2026-01-03T00:00:00Z",
  },
];

describe("aliases", () => {
  it("builds sequential aliases starting at 1", () => {
    const aliases = buildAliases(mockAccounts);
    expect(aliases).toHaveLength(3);
    expect(aliases[0].alias).toBe(1);
    expect(aliases[2].alias).toBe(3);
  });

  it("keeps numeric IDs stable when API order changes", () => {
    const shuffled = [mockAccounts[2], mockAccounts[0], mockAccounts[1]];
    const aliases = buildAliases(shuffled);
    expect(aliases.map((a) => a.account.id)).toEqual([
      "uuid-twitter",
      "uuid-linkedin",
      "uuid-instagram",
    ]);
  });

  it("formats account labels for interactive display", () => {
    const aliases = buildAliases(mockAccounts);
    expect(formatAccountLabel(aliases[0])).toBe("1. twitter (social0)");
    expect(formatAccountLabel(aliases[2])).toContain("(expired)");
  });

  it("resolves numeric alias to UUID", () => {
    expect(resolveAliasToId(1, mockAccounts)).toBe("uuid-twitter");
    expect(resolveAliasToId(2, mockAccounts)).toBe("uuid-linkedin");
    expect(resolveAliasToId(99, mockAccounts)).toBeNull();
  });

  it("resolves platform names to account IDs", () => {
    const ids = resolvePlatformToIds(["twitter", "linkedin"], mockAccounts);
    expect(ids).toEqual(["uuid-twitter", "uuid-linkedin"]);
  });

  it("resolves mixed refs (numbers and platform names)", () => {
    const ids = resolveAccountRefs(["1", "linkedin"], mockAccounts);
    expect(ids).toEqual(["uuid-twitter", "uuid-linkedin"]);
  });

  it("formats twitter_x as twitter", () => {
    expect(formatPlatformName("twitter_x")).toBe("twitter");
  });
});

describe("dates", () => {
  it("parses tomorrow as local wall-clock 9am", () => {
    const result = parseNaturalTime("tomorrow 9am");
    expect(result).toMatch(/T09:00:00\+default$/);
  });

  it("parses relative hours without UTC shifting", () => {
    const result = parseNaturalTime("in 2 hours");
    expect(result).toMatch(/T\d{2}:\d{2}:\d{2}\+default$/);
  });

  it("parses in N days at time", () => {
    const result = parseNaturalTime("in 2 days at 3pm");
    expect(result).toMatch(/T15:00:00\+default$/);
  });

  it("parses month-name and ordinal dates", () => {
    expect(parseNaturalTime("Aug 10 2099 9:00am")).toBe("2099-08-10T09:00:00+default");
    expect(parseNaturalTime("August 8th 2099 9am")).toBe("2099-08-08T09:00:00+default");
  });

  it("parses bare weekdays, abbreviations, and time-first order", () => {
    for (const phrase of ["monday 9am", "mon 9am", "9am monday", "next monday 9am"]) {
      const result = parseNaturalTime(phrase);
      expect(result).toMatch(/T09:00:00\+default$/);
      const day = new Date(
        Number(result.slice(0, 4)),
        Number(result.slice(5, 7)) - 1,
        Number(result.slice(8, 10)),
      ).getDay();
      expect(day).toBe(1);
    }
  });

  it("parses noon, next week, and in N weeks", () => {
    expect(parseNaturalTime("tomorrow noon")).toMatch(/T12:00:00\+default$/);
    expect(parseNaturalTime("next week 9am")).toMatch(/T09:00:00\+default$/);
    expect(parseNaturalTime("in 1 week")).toMatch(/T\d{2}:\d{2}:\d{2}\+default$/);
  });

  it("parses ISO including date-only and preserves Z", () => {
    expect(parseNaturalTime("2099-08-10 14:00")).toBe("2099-08-10T14:00:00+default");
    expect(parseNaturalTime("2099-08-10")).toBe("2099-08-10T09:00:00+default");
    expect(parseNaturalTime("2099-12-25T09:00:00Z")).toBe("2099-12-25T09:00:00Z");
  });

  it("rejects past times, slash dates, and partial matches", () => {
    expect(() => parseNaturalTime("2020-08-01 14:00")).toThrow(/must be in the future/);
    expect(() => parseNaturalTime("8/10/2026 9am")).toThrow(/Ambiguous date format/);
    expect(() => parseNaturalTime("Aug 32 2099 9am")).toThrow(/Unable to parse time/);
    expect(() => parseNaturalTime("schedule this monday please")).toThrow(/Unable to parse time/);
    expect(() => parseNaturalTime("yesterday")).toThrow(/must be in the future|Unable to parse/);
  });
});

describe("files", () => {
  it("parses markdown front matter", () => {
    const md = `---
platforms:
  - twitter
  - linkedin
schedule: tomorrow 9am
---

Launch day!`;
    const parsed = parseMarkdownFrontMatter(md);
    expect(parsed.content).toBe("Launch day!");
    expect(parsed.platforms).toEqual(["twitter", "linkedin"]);
    expect(parsed.schedule).toBe("tomorrow 9am");
  });

  it("guesses mime types", () => {
    expect(guessMimeType("photo.jpg")).toBe("image/jpeg");
    expect(guessMimeType("video.mp4")).toBe("video/mp4");
  });
});

describe("sanitizeForTerminal", () => {
  it("strips ANSI colour and cursor sequences", async () => {
    const { sanitizeForTerminal } = await import("../src/utils/output.js");
    expect(sanitizeForTerminal("\u001b[31mred\u001b[0m text \u001b[2J\u001b[H")).toBe(
      "red text ",
    );
  });

  it("strips OSC sequences such as clipboard writes and title changes", async () => {
    const { sanitizeForTerminal } = await import("../src/utils/output.js");
    expect(sanitizeForTerminal("hi \u001b]52;c;aGVsbG8=\u0007there")).toBe("hi there");
    expect(sanitizeForTerminal("hi \u001b]0;pwned\u001b\\there")).toBe("hi there");
    expect(sanitizeForTerminal("hi \u009d0;pwned\u009cthere")).toBe("hi 0;pwnedthere");
  });

  it("drops C0 controls and folds line breaks so a row stays one line", async () => {
    const { sanitizeForTerminal } = await import("../src/utils/output.js");
    expect(sanitizeForTerminal("a\u0000b\u0007c\r\nd\te")).toBe("abc d e");
  });

  it("keeps ordinary text, unicode, and emoji untouched", async () => {
    const { sanitizeForTerminal } = await import("../src/utils/output.js");
    expect(sanitizeForTerminal("héllo — 世界 🚀 @user")).toBe("héllo — 世界 🚀 @user");
  });

  it("scrubs table cells and status lines end to end", async () => {
    const { printOutput, warn } = await import("../src/utils/output.js");
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      printOutput([{ author: "\u001b]52;c;eHg=\u0007mallory", comment: "\u001b[31mhi" }], "table");
      warn("X: \u001b[2Jrate limited");
    } finally {
      spy.mockRestore();
    }
    const joined = lines.join("\n");
    expect(joined).not.toContain("\u001b");
    expect(joined).toContain("mallory");
    expect(joined).toContain("rate limited");
  });
});
