import { describe, it, expect } from "vitest";
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
    expect(result).not.toMatch(/Unable/);
  });

  it("parses in N days at time", () => {
    const result = parseNaturalTime("in 2 days at 3pm");
    expect(result).toMatch(/T15:00:00\+default$/);
  });

  it("passes through ISO dates", () => {
    const result = parseNaturalTime("2026-08-01 14:00");
    expect(result).toContain("2026-08-01");
    expect(result).toMatch(/T14:00:00\+default$/);
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
