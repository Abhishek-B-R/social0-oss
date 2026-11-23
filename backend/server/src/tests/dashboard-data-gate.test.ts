/**
 * `dashboard-data.*` readers.
 *
 * 1. Every team-data reader goes through `requireWorkspaceSession`, so a
 *    teammate whose owner's Pro lapsed gets the same 403 message that
 *    posts.* / dashboard.getHome return, and nothing is read (or refreshed
 *    on the owner's tokens).
 * 2. The calendar read is bounded: a hard row cap, an optional visible
 *    window, and only `metadata -> 'source'` instead of the whole column.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const {
  mockDb,
  mockRequireWorkspaceSession,
  mockSyncToLimit,
  mockHealthCheck,
  mockCheckBulkToolsAllowed,
  mockGetPostDetail,
  mockGetSubscription,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    query: {
      userSettings: { findFirst: vi.fn() },
      connectedAccounts: { findMany: vi.fn() },
    },
  },
  mockRequireWorkspaceSession: vi.fn(),
  mockSyncToLimit: vi.fn(),
  mockHealthCheck: vi.fn(),
  mockCheckBulkToolsAllowed: vi.fn(),
  mockGetPostDetail: vi.fn(),
  mockGetSubscription: vi.fn(),
}));

// dashboard-data imports through the `@/` tsconfig alias, which vitest does
// not resolve (the build rewrites it with tsc-alias). Mock those ids as-is.
vi.mock("@/db", () => ({ db: mockDb }));
vi.mock("@/db/schema", () => import("../db/schema.js"));
vi.mock("@/lib/rpc-http-error", () => import("../lib/rpc-http-error.js"));
vi.mock("@/lib/publication-error-kind", () =>
  import("../lib/publication-error-kind.js"),
);
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("../lib/http/request-cookies.js", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/lib/workspace/session", () => ({
  requireWorkspaceSession: mockRequireWorkspaceSession,
}));
vi.mock("@/lib/workspace/context", () => ({
  resolveWorkspaceContext: vi.fn(),
  connectionScopeCondition: vi.fn(() => undefined),
}));
vi.mock("@/lib/plan-limits", () => ({
  checkAccountLimits: vi.fn(),
  checkFreePostLimit: vi.fn(),
  checkBulkToolsAllowed: mockCheckBulkToolsAllowed,
  syncConnectedAccountsToLimit: mockSyncToLimit,
}));
vi.mock("@/lib/token-health", () => ({
  NEVER_EXPIRES_PLATFORMS: new Set<string>(),
  runTokenHealthCheckForUser: mockHealthCheck,
}));
vi.mock("@/lib/posts-list/posts-list-data", () => ({
  getPostsListData: vi.fn(),
  getPostsStatusCounts: vi.fn(),
  hasPaymentFailedPosts: vi.fn(),
  POSTS_PAGE_SIZE: 20,
  getPostDetail: mockGetPostDetail,
  getPostMedia: vi.fn(),
  getAdjacentPostIds: vi.fn(),
  getPostsSourceOptions: vi.fn(),
}));
vi.mock("@/lib/post-source", () => ({
  buildPostSourceDtos: vi.fn(async (rows: { id: string }[]) => {
    return new Map(rows.map((r) => [r.id, { kind: "user" }]));
  }),
  loadUserNames: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/subscription", () => ({
  getSubscriptionForUser: mockGetSubscription,
}));
vi.mock("@/services/settings", () => ({
  getUserSettingsSnapshot: vi.fn(async () => ({
    use24HourTimeFormat: false,
    dateFormat: null,
    timezone: "UTC",
  })),
}));
vi.mock("@/lib/resolve-scheduled-at", () => ({
  getUserTimezone: vi.fn(async () => "UTC"),
}));
vi.mock("@/lib/publish-timeline", () => ({
  loadPublishTimelineForPost: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: {} }));

const dashboardData = await import("../services/dashboard-data.js");
const {
  CALENDAR_MAX_POSTS,
  checkBulkToolsGate,
  loadAdjacentPosts,
  loadCalendarPageData,
  loadComposerSettings,
  loadConnectionsPageData,
  loadPostDetailCoreData,
  loadPostDetailMediaData,
  loadPostsPageData,
  resolveCalendarWindow,
} = dashboardData;

const LAPSED =
  "This team's Pro subscription is inactive. Ask the team owner to renew Pro so you can keep posting.";

type Captured = {
  fields?: Record<string, unknown>;
  where?: SQL;
  orderBy?: unknown[];
  limit?: number;
};

/** Drizzle-style builder that records its args; awaiting yields `rows`. */
function selectChain(rows: unknown[], captured: Captured) {
  const chain: Record<string, unknown> = {};
  const self: Record<string, unknown> = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(rows);
      }
      return (...args: unknown[]) => {
        if (prop === "where") captured.where = args[0] as SQL;
        if (prop === "orderBy") captured.orderBy = args;
        if (prop === "limit") captured.limit = args[0] as number;
        return self;
      };
    },
  });
  return self;
}

const dialect = new PgDialect();
const render = (q: SQL) => dialect.sqlToQuery(q);

const okCtx = {
  actorUserId: "owner-1",
  resourceUserId: "owner-1",
  workspaceId: null,
  inWorkspace: false,
  isOwner: true,
  teamsEnabled: true,
  permissions: new Set(["view_posts", "view_connections"]),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dashboard-data readers: lapsed-Pro teammate gate", () => {
  beforeEach(() => {
    mockRequireWorkspaceSession.mockResolvedValue({
      ok: false,
      error: LAPSED,
      statusCode: 403,
    });
  });

  it.each([
    ["loadPostsPageData", () => loadPostsPageData({}), "view_posts"],
    ["loadCalendarPageData", () => loadCalendarPageData(), "view_posts"],
    ["loadPostDetailCoreData", () => loadPostDetailCoreData("p1"), "view_posts"],
    ["loadPostDetailMediaData", () => loadPostDetailMediaData("p1"), "view_posts"],
    ["loadAdjacentPosts", () => loadAdjacentPosts({ postId: "p1" }), "view_posts"],
    [
      "loadConnectionsPageData",
      () => loadConnectionsPageData(),
      "view_connections",
    ],
  ] as const)("%s returns the lapsed error and reads nothing", async (_n, call, perm) => {
    await expect(call()).resolves.toEqual({ ok: false, error: LAPSED });
    expect(mockRequireWorkspaceSession).toHaveBeenCalledWith(perm);
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.query.connectedAccounts.findMany).not.toHaveBeenCalled();
    expect(mockGetPostDetail).not.toHaveBeenCalled();
  });

  it("loadConnectionsPageData runs no sync / health check on the owner's tokens", async () => {
    await loadConnectionsPageData();
    expect(mockSyncToLimit).not.toHaveBeenCalled();
    expect(mockHealthCheck).not.toHaveBeenCalled();
  });

  it("loadComposerSettings rejects with the gate's status code", async () => {
    await expect(loadComposerSettings()).rejects.toMatchObject({
      message: LAPSED,
      statusCode: 403,
    });
    expect(mockDb.query.userSettings.findFirst).not.toHaveBeenCalled();
  });

  it("checkBulkToolsGate is closed", async () => {
    await expect(checkBulkToolsGate()).resolves.toEqual({ allowed: false });
    expect(mockCheckBulkToolsAllowed).not.toHaveBeenCalled();
  });
});

/**
 * The composer used to read the raw `subscription_tier` and expiry and apply
 * `expiresAt < now` in the SPA. `subscriptionExpiresAt` is Dodo's
 * next_billing_date, and the server keeps a paid plan past it until the
 * renewal webhook lands, so a paying user saw the free quota and disabled
 * Auto-Plug / Auto-Repost toggles in that window.
 */
describe("loadComposerSettings", () => {
  beforeEach(() => {
    mockRequireWorkspaceSession.mockResolvedValue({ ok: true, ctx: okCtx });
    mockDb.query.userSettings.findFirst.mockResolvedValue({ freePostsUsed: 3 });
  });

  it("reports the tier the server enforces, not the raw column", async () => {
    const billingDate = new Date(Date.now() - 60 * 60 * 1000);
    mockGetSubscription.mockResolvedValue({
      tier: "pro",
      expiresAt: billingDate,
      cancelAtPeriodEnd: false,
    });

    await expect(loadComposerSettings()).resolves.toEqual({
      subscriptionTier: "pro",
      subscriptionExpiresAt: billingDate.toISOString(),
      freePostsUsed: 3,
    });
    expect(mockGetSubscription).toHaveBeenCalledWith("owner-1");
  });

  it("reports free once the server says the plan lapsed", async () => {
    mockGetSubscription.mockResolvedValue({
      tier: "free",
      expiresAt: null,
      cancelAtPeriodEnd: false,
    });

    await expect(loadComposerSettings()).resolves.toMatchObject({
      subscriptionTier: "free",
      subscriptionExpiresAt: null,
    });
  });
});

describe("resolveCalendarWindow", () => {
  it("treats a missing window as the default read", () => {
    expect(resolveCalendarWindow(undefined)).toBeUndefined();
    expect(resolveCalendarWindow(null)).toBeUndefined();
    expect(resolveCalendarWindow({})).toBeUndefined();
  });

  it("rejects malformed, reversed and over-wide windows", () => {
    expect(resolveCalendarWindow({ from: "nope", to: "2026-11-01" })).toBeNull();
    expect(resolveCalendarWindow({ from: "2026-10-01" })).toBeNull();
    expect(
      resolveCalendarWindow({ from: "2026-11-01", to: "2026-10-01" }),
    ).toBeNull();
    expect(
      resolveCalendarWindow({ from: "2020-01-01", to: "2026-01-01" }),
    ).toBeNull();
    expect(resolveCalendarWindow("2026-10")).toBeNull();
  });

  it("pads a valid window by a day on each side", () => {
    const w = resolveCalendarWindow({
      from: "2026-10-01T00:00:00.000Z",
      to: new Date("2026-11-01T00:00:00.000Z"),
    });
    expect(w?.from.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(w?.to.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
});

describe("loadCalendarPageData: bounded read", () => {
  beforeEach(() => {
    mockRequireWorkspaceSession.mockResolvedValue({ ok: true, ctx: okCtx });
  });

  function stubPostsQuery(rows: unknown[]) {
    const postsQuery: Captured = {};
    mockDb.select.mockImplementation((fields: Record<string, unknown>) => {
      if (mockDb.select.mock.calls.length === 1) {
        postsQuery.fields = fields;
        return selectChain(rows, postsQuery);
      }
      return selectChain([], {});
    });
    return postsQuery;
  }

  it("caps the default read and keeps the posts nearest today", async () => {
    const postsQuery = stubPostsQuery([]);
    const res = await loadCalendarPageData();
    expect(res).toMatchObject({ ok: true, data: { posts: [], truncated: false } });
    expect(postsQuery.limit).toBe(CALENDAR_MAX_POSTS + 1);
    const order = render(postsQuery.orderBy![0] as SQL).sql;
    expect(order).toContain("abs(extract(epoch from");
    // No date bound on the default read.
    expect(render(postsQuery.where!).sql).not.toContain("published_at");
  });

  it("selects only metadata.source, not the whole metadata column", async () => {
    const postsQuery = stubPostsQuery([]);
    await loadCalendarPageData();
    const meta = render(postsQuery.fields!.metadata as SQL).sql;
    expect(meta).toContain(`-> 'source'`);
  });

  it("filters to the requested window", async () => {
    const postsQuery = stubPostsQuery([]);
    await loadCalendarPageData({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-01T00:00:00.000Z",
    });
    const where = render(postsQuery.where!);
    expect(where.sql).toContain(`"posts"."scheduled_at" >=`);
    expect(where.sql).toContain(`"posts"."created_at" <`);
    expect(where.sql).toContain(`exists (select 1 from "post_publications"`);
    expect(where.params).toContain("2026-09-30T00:00:00.000Z");
    expect(where.params).toContain("2026-11-02T00:00:00.000Z");
    expect(postsQuery.limit).toBe(CALENDAR_MAX_POSTS + 1);
  });

  it("rejects a malformed window before touching the database", async () => {
    stubPostsQuery([]);
    await expect(
      loadCalendarPageData({ from: "x", to: "y" }),
    ).resolves.toEqual({ ok: false, error: "BadRequest" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("drops the overflow row and reports truncation", async () => {
    const rows = Array.from({ length: CALENDAR_MAX_POSTS + 1 }, (_, i) => ({
      id: `p${i}`,
      originalContent: "hi",
      status: "published",
      scheduledAt: null,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      metadata: { source: null },
      createdByUserId: "owner-1",
    }));
    stubPostsQuery(rows);
    const res = await loadCalendarPageData();
    if (!res.ok) throw new Error(res.error);
    expect(res.data.posts).toHaveLength(CALENDAR_MAX_POSTS);
    expect(res.data.truncated).toBe(true);
  });
});
