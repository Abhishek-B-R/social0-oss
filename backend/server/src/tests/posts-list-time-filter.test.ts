/**
 * Posts "This week" / "This month" count from the viewer's own calendar.
 *
 * The boundaries were computed in the API process's zone (UTC on the droplet),
 * so a Los Angeles user opening "This week" on Sunday evening saw only the
 * hour since Monday 00:00 UTC, and a user in India on Monday morning still got
 * all of last week. The list, the tab counts and prev/next all share the WHERE.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const h = vi.hoisted(() => ({ where: vi.fn() }));

const mockDb = vi.hoisted(() => ({
  db: {
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          h.where(where);
          return Promise.resolve([{}]);
        },
      }),
    }),
  },
}));
vi.mock("@/db", () => mockDb);
vi.mock("../db/index.js", () => mockDb);
vi.mock("@/db/schema", () => import("../db/schema.js"));
vi.mock("@/lib/stuck-publishing", () => import("../lib/stuck-publishing.js"));
vi.mock("@/lib/account-reconnect", () => import("../lib/account-reconnect.js"));
vi.mock("@/lib/platforms", () => import("../lib/platforms.js"));
vi.mock("@/lib/resolve-scheduled-at", () =>
  import("../lib/resolve-scheduled-at.js"),
);
vi.mock("@/lib/subscription", () => ({ getSubscriptionForUser: vi.fn() }));
vi.mock("@/lib/workspace/context", () => ({
  connectionScopeCondition: vi.fn(),
}));
vi.mock("@/lib/post-source", async () => {
  const { sql } = await import("drizzle-orm");
  return { agentSourceCondition: () => sql`false` };
});

import {
  getPostsStatusCounts,
  postsTimeFilterStart,
} from "../lib/posts-list/posts-list-data.js";

const iso = (d: Date | null) => d?.toISOString() ?? null;

beforeEach(() => {
  h.where.mockReset();
});

describe("postsTimeFilterStart", () => {
  // Monday 2026-10-19 01:00 UTC = Sunday 18:00 in Los Angeles (PDT).
  const sundayEveningLA = new Date("2026-10-19T01:00:00.000Z");

  it("starts the week on the viewer's Monday, not the server's", () => {
    expect(
      iso(postsTimeFilterStart("week", "America/Los_Angeles", sundayEveningLA)),
    ).toBe("2026-10-12T07:00:00.000Z");
  });

  it("starts a viewer ahead of UTC on their own Monday", () => {
    // Monday 03:00 in Kolkata is still Sunday 21:30 UTC.
    const mondayMorningIndia = new Date("2026-10-18T21:30:00.000Z");
    expect(
      iso(postsTimeFilterStart("week", "Asia/Kolkata", mondayMorningIndia)),
    ).toBe("2026-10-18T18:30:00.000Z");
  });

  it("starts the month on the viewer's 1st", () => {
    // Halloween evening in Los Angeles is already November in UTC.
    const halloweenLA = new Date("2026-11-01T03:00:00.000Z");
    expect(
      iso(postsTimeFilterStart("month", "America/Los_Angeles", halloweenLA)),
    ).toBe("2026-10-01T07:00:00.000Z");
  });

  it("falls back to UTC for a missing or unknown zone", () => {
    expect(iso(postsTimeFilterStart("week", null, sundayEveningLA))).toBe(
      "2026-10-19T00:00:00.000Z",
    );
    expect(
      iso(postsTimeFilterStart("week", "Mars/Olympus_Mons", sundayEveningLA)),
    ).toBe("2026-10-19T00:00:00.000Z");
  });

  it("applies no bound without a week or month filter", () => {
    expect(postsTimeFilterStart(null, "Asia/Kolkata")).toBeNull();
    expect(postsTimeFilterStart("year", "Asia/Kolkata")).toBeNull();
  });
});

describe("Posts tab counts share the viewer's week", () => {
  it("bounds the counts by the viewer's week start", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T01:00:00.000Z"));
    try {
      await getPostsStatusCounts({
        userId: "user-1",
        time: "week",
        timeZone: "America/Los_Angeles",
      });
    } finally {
      vi.useRealTimers();
    }

    const { params } = new PgDialect().sqlToQuery(h.where.mock.calls[0]![0]);
    expect(params).toContain("2026-10-12T07:00:00.000Z");
    expect(params).not.toContain("2026-10-19T00:00:00.000Z");
  });
});
