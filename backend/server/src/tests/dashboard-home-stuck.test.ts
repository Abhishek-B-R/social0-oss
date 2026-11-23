/**
 * Home's "stuck publishing" rule must be the one in lib/stuck-publishing.ts.
 *
 * Home used to call a "publishing" post failed after 10 minutes while the
 * posts list, post detail, the SPA and the publish engine's takeover all use
 * `STUCK_PUBLISHING_MINUTES` (15). Between the two, Home offered a Retry on a
 * post whose deliveries were still queued, and that Retry ran a second
 * publish next to the queued one.
 */

import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";

// dashboard-home imports through the `@/` tsconfig alias, which vitest does
// not resolve (the build rewrites it with tsc-alias). Mock those ids as-is.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => import("../db/schema.js"));
vi.mock("@/lib/stuck-publishing", () => import("../lib/stuck-publishing.js"));
vi.mock("@/lib/publication-error-kind", () =>
  import("../lib/publication-error-kind.js"),
);
vi.mock("@/lib/account-reconnect", () => import("../lib/account-reconnect.js"));
vi.mock("@social0/shared", () => ({
  getPlanLimits: vi.fn(),
  NEVER_EXPIRES_PLATFORMS: new Set<string>(),
}));
vi.mock("@/lib/subscription", () => ({ getSubscriptionForUser: vi.fn() }));
vi.mock("@/lib/resolve-scheduled-at", () => ({ isValidIanaTimezone: vi.fn() }));
vi.mock("@/lib/workspace/session", () => ({ requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/workspace/context", () => ({
  connectionScopeCondition: vi.fn(),
  postScopeCondition: vi.fn(),
}));
vi.mock("@/lib/post-source", () => ({
  agentSourceCondition: vi.fn(),
  buildPostSourceDtos: vi.fn(),
}));
vi.mock("@/lib/mcp-oauth", () => ({ isMcpConnectorKeyName: vi.fn() }));

const { effectiveStatus, homeStatusSql, runningPublicationSql } = await import(
  "../services/dashboard-home.js"
);
const { STUCK_PUBLISHING_MINUTES, idlePublicationSql, postPublishingStaleSql } =
  await import("../lib/stuck-publishing.js");
const { postPublications } = await import("../db/schema.js");

const dialect = new PgDialect();
const render = (q: SQL) => dialect.sqlToQuery(q).sql;

const NOW = new Date("2026-10-20T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const pendingPub = {
  publicationId: "pub-1",
  connectedAccountId: "acc-1",
  platform: "twitter_x",
  platformUsername: null,
  profileImageUrl: null,
  status: "pending",
  platformPostUrl: null,
  publishedAt: null,
  error: null,
  errorKind: null,
};

describe("dashboard home stuck-publishing threshold", () => {
  it("keeps a queued post publishing until STUCK_PUBLISHING_MINUTES", () => {
    const row = (age: number) => ({
      status: "publishing",
      createdAt: minutesAgo(60),
      scheduledAt: null,
      updatedAt: minutesAgo(age),
    });

    // 12 minutes: still queued, every other surface says Publishing.
    expect(effectiveStatus(row(12), [pendingPub], false, NOW)).toBe("publishing");
    expect(
      effectiveStatus(row(STUCK_PUBLISHING_MINUTES - 1), [pendingPub], false, NOW),
    ).toBe("publishing");
    // Past the shared threshold: stuck, failed with a Retry.
    expect(
      effectiveStatus(row(STUCK_PUBLISHING_MINUTES + 1), [pendingPub], false, NOW),
    ).toBe("failed");
    // A delivery still running blocks "stuck" whatever the age.
    expect(
      effectiveStatus(row(STUCK_PUBLISHING_MINUTES + 1), [pendingPub], true, NOW),
    ).toBe("publishing");
  });

  it("builds the SQL twin from the shared stuck rule, with no local interval", () => {
    const stale = render(postPublishingStaleSql);
    for (const q of [homeStatusSql.publishing, homeStatusSql.failed]) {
      const text = render(q);
      expect(text).toContain(stale);
      expect(text).toContain(`interval '${STUCK_PUBLISHING_MINUTES} minutes'`);
      expect(text).not.toMatch(/interval '(?!15 minutes')/);
    }
  });

  it("uses the engine's idle rule for a running delivery", () => {
    expect(render(runningPublicationSql(postPublications))).toContain(
      render(idlePublicationSql),
    );
    // Aliased form used inside Home's correlated subqueries.
    const aliased = render(
      runningPublicationSql({
        status: sql`pp.status`,
        updatedAt: sql`pp.updated_at`,
        createdAt: sql`pp.created_at`,
      }),
    );
    expect(aliased).toContain("coalesce(pp.updated_at, pp.created_at) <");
    expect(aliased).toContain(`interval '${STUCK_PUBLISHING_MINUTES} minutes'`);
  });
});
