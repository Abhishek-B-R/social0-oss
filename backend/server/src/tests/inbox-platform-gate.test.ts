/**
 * LIVE_PLATFORMS is the rollout / App Review gate. Naming a disabled network
 * in `platform=` must not force a live fetch for it - on the dashboard RPC or
 * on /v1.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetUserTimezone, mockListActiveConnectedAccounts } =
  vi.hoisted(() => ({
    mockDb: { select: vi.fn() },
    mockGetUserTimezone: vi.fn(),
    mockListActiveConnectedAccounts: vi.fn(),
  }));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/workspace/session.js", () => ({
  requireWorkspaceSession: vi.fn(),
}));
vi.mock("../lib/account-access.js", () => ({
  resolveAccountAccess: vi.fn(),
}));
// The platform adapters pull in the publish media path (tsc-alias import);
// they are never reached by the gate.
vi.mock("../lib/inbox/reply-comment.js", () => ({ replyOnPlatform: vi.fn() }));
vi.mock("../lib/inbox/reply-dm.js", () => ({ replyToDmOnPlatform: vi.fn() }));
vi.mock("../lib/resolve-scheduled-at.js", () => ({
  getUserTimezone: mockGetUserTimezone,
}));
vi.mock("../lib/connected-accounts.js", () => ({
  listActiveConnectedAccounts: mockListActiveConnectedAccounts,
}));
vi.mock("../lib/live-platforms.js", () => {
  const live: Record<string, Record<string, boolean>> = {
    analytics: { bluesky: true },
    inboxComments: { bluesky: true, youtube: true, instagram: false },
    inboxDms: { bluesky: true },
  };
  return {
    LIVE_PLATFORMS: live,
    isPlatformLive: (feature: string, platform: string) =>
      live[feature]?.[platform] === true,
    livePlatformIds: (feature: string) =>
      Object.entries(live[feature] ?? {})
        .filter(([, on]) => on)
        .map(([id]) => id),
  };
});

const { listInboxCommentsForScope } = await import("../services/inbox.js");

const ctx = { resourceUserId: "user-1", workspaceId: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserTimezone.mockResolvedValue("UTC");
  mockListActiveConnectedAccounts.mockResolvedValue([]);
});

describe("inbox comments platform gate", () => {
  it("does not touch the database or any platform for a disabled network", async () => {
    const out = await listInboxCommentsForScope(ctx, { platform: "instagram" });
    expect(out.threads).toEqual([]);
    expect(out.unsupported).toEqual(["instagram"]);
    expect(out.hasMore).toBe(false);
    expect(out.fetchErrors).toEqual([]);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("ignores platforms outside the catalog entirely", async () => {
    // Unknown strings parse to "no filter"; the live list still applies.
    mockDb.select.mockReturnValue(chain([]));
    const out = await listInboxCommentsForScope(ctx, { platform: "myspace" });
    expect(out.unsupported).toEqual([]);
    expect(out.threads).toEqual([]);
  });

  it("still reads a live network", async () => {
    mockDb.select.mockReturnValue(chain([]));
    const out = await listInboxCommentsForScope(ctx, { platform: "bluesky" });
    expect(out.unsupported).toEqual([]);
    expect(mockDb.select).toHaveBeenCalled();
  });
});

/** Drizzle-style builder: every method chains, awaiting yields `rows`. */
function chain(rows: unknown[]) {
  const target: Record<string, unknown> = {};
  const self = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(rows);
      }
      return () => self;
    },
  });
  return self;
}
