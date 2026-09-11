import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetSubscriptionForUser } = vi.hoisted(() => ({
  mockGetSubscriptionForUser: vi.fn(),
  mockDb: {
    query: {
      connectedAccounts: { findFirst: vi.fn() },
      teams: { findFirst: vi.fn() },
      workspaces: { findFirst: vi.fn() },
      teamMembers: { findFirst: vi.fn() },
      teamInvitations: { findFirst: vi.fn() },
      user: { findFirst: vi.fn() },
      userSettings: { findFirst: vi.fn() },
    },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/subscription.js", () => ({
  getSubscriptionForUser: mockGetSubscriptionForUser,
}));
vi.mock("../lib/workspace/context.js", () => ({
  resolveWorkspaceContext: vi.fn(),
  ensureOwnerWorkspace: vi.fn(),
  ensureOwnerTeam: vi.fn(),
  setActiveWorkspace: vi.fn(),
  defaultWorkspaceNameForTeam: (name: string) => `${name}'s default workspace`,
  personalWorkspaceContext: vi.fn(),
}));
vi.mock("../lib/workspace/emails.js", () => ({
  sendWorkspaceInviteEmail: vi.fn(),
  sendWorkspaceInviteAcceptedEmail: vi.fn(),
  sendWorkspaceMemberRemovedEmail: vi.fn(),
  sendWorkspaceRoleChangedEmail: vi.fn(),
}));
vi.mock("../lib/workspace/room-cache.js", () => ({
  getCachedTeamMembers: vi.fn().mockResolvedValue(null),
  getCachedTeamMeta: vi.fn().mockResolvedValue(null),
  getCachedTeamWorkspaces: vi.fn().mockResolvedValue(null),
  getCachedWorkspaceMeta: vi.fn().mockResolvedValue(null),
  setCachedTeamMembers: vi.fn().mockResolvedValue(undefined),
  setCachedTeamMeta: vi.fn().mockResolvedValue(undefined),
  setCachedTeamWorkspaces: vi.fn().mockResolvedValue(undefined),
  setCachedWorkspaceMeta: vi.fn().mockResolvedValue(undefined),
  invalidateTeamMembersCache: vi.fn().mockResolvedValue(undefined),
  invalidateTeamRoomCache: vi.fn().mockResolvedValue(undefined),
  invalidateTeamWorkspacesCache: vi.fn().mockResolvedValue(undefined),
  invalidateWorkspaceRoomCache: vi.fn().mockResolvedValue(undefined),
}));

import {
  TeamServiceError,
  moveConnectedAccountToWorkspace,
} from "../lib/workspace/team-service.js";

/**
 * `db.select()` is used with several builder shapes here (workspace access
 * join, workspace meta lookup), so the mock answers any chain and resolves to
 * the same row set.
 */
function mockSelectRows(rows: Record<string, unknown>[]) {
  mockDb.select.mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy"]) {
      builder[method] = vi.fn(chain);
    }
    builder.limit = vi.fn().mockResolvedValue(rows);
    builder.then = (
      resolve: (value: Record<string, unknown>[]) => unknown,
    ) => resolve(rows);
    return builder;
  });
}

/** `assertCanManageAccount` reads (ownerUserId, role) for the source workspace. */
function mockWorkspaceAccessRow(row: {
  ownerUserId: string;
  role: "admin" | "member" | "community" | "analyst";
}) {
  mockSelectRows([row]);
}

describe("moveConnectedAccountToWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscriptionForUser.mockResolvedValue({ tier: "pro" });
  });

  /**
   * A team Admin has `manage_connections` inside the team's workspaces. Moving
   * to board "Main" transfers ownership of the connection (and its platform
   * tokens) to the actor, so it must not be reachable for someone else's
   * account — otherwise an invited Admin can walk the owner's social account
   * out of the team into their own private pool.
   */
  it("refuses to move another user's connection into the actor's personal Main", async () => {
    mockDb.query.connectedAccounts.findFirst.mockResolvedValue({
      id: "acc-1",
      userId: "owner-1",
      workspaceId: "ws-1",
      platform: "twitter_x",
      platformUserId: "x-1",
    });
    mockWorkspaceAccessRow({ ownerUserId: "owner-1", role: "admin" });

    await expect(
      moveConnectedAccountToWorkspace("admin-2", "acc-1", null),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("still lets the account owner pull their own connection back to Main", async () => {
    mockDb.query.connectedAccounts.findFirst
      .mockResolvedValueOnce({
        id: "acc-1",
        userId: "owner-1",
        workspaceId: "ws-1",
        platform: "twitter_x",
        platformUserId: "x-1",
      })
      // duplicate / already-in-destination probes
      .mockResolvedValue(undefined);
    mockWorkspaceAccessRow({ ownerUserId: "owner-1", role: "admin" });

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    mockDb.update.mockReturnValue({ set });

    await expect(
      moveConnectedAccountToWorkspace("owner-1", "acc-1", null),
    ).resolves.toEqual({ workspaceId: null });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: null, userId: "owner-1" }),
    );
  });

  it("rejects a non-string, non-null workspace id", async () => {
    await expect(
      moveConnectedAccountToWorkspace("owner-1", "acc-1", 42),
    ).rejects.toBeInstanceOf(TeamServiceError);
  });
});
