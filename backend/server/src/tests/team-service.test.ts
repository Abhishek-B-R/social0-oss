import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockResolveWorkspaceContext,
  mockEnsureOwnerWorkspace,
  mockEnsureOwnerTeam,
  mockGetSubscriptionForUser,
  mockDb,
  mockSendInviteEmail,
} = vi.hoisted(() => ({
  mockResolveWorkspaceContext: vi.fn(),
  mockEnsureOwnerWorkspace: vi.fn(),
  mockEnsureOwnerTeam: vi.fn(),
  mockGetSubscriptionForUser: vi.fn(),
  mockSendInviteEmail: vi.fn(),
  mockDb: {
    query: {
      user: { findFirst: vi.fn() },
      teamMembers: { findFirst: vi.fn() },
      teamInvitations: { findFirst: vi.fn() },
      teams: { findFirst: vi.fn() },
      workspaces: { findFirst: vi.fn() },
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
  resolveWorkspaceContext: mockResolveWorkspaceContext,
  ensureOwnerWorkspace: mockEnsureOwnerWorkspace,
  ensureOwnerTeam: mockEnsureOwnerTeam,
}));
vi.mock("../lib/workspace/emails.js", () => ({
  sendWorkspaceInviteEmail: mockSendInviteEmail,
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
  acceptInvite,
  inviteMember,
  removeMember,
  updateMemberRole,
} from "../lib/workspace/team-service.js";
import {
  permissionsForRole,
  toPermissionsDto,
} from "../lib/workspace/permissions.js";

function adminCtx(overrides: Record<string, unknown> = {}) {
  const permissions = permissionsForRole("admin", {
    isOwner: true,
    teamsEnabled: true,
    inWorkspace: true,
  });
  return {
    actorUserId: "owner-1",
    resourceUserId: "owner-1",
    workspaceId: "ws-1",
    workspaceName: "Main",
    teamId: "team-1",
    teamName: "Acme",
    ownerUserId: "owner-1",
    role: "admin" as const,
    isOwner: true,
    teamsEnabled: true,
    inWorkspace: true,
    permissions,
    permissionsDto: toPermissionsDto(permissions),
    ...overrides,
  };
}

function memberCtx() {
  const permissions = permissionsForRole("member", {
    isOwner: false,
    teamsEnabled: true,
    inWorkspace: true,
  });
  return {
    actorUserId: "member-1",
    resourceUserId: "owner-1",
    workspaceId: "ws-1",
    workspaceName: "Main",
    teamId: "team-1",
    teamName: "Acme",
    ownerUserId: "owner-1",
    role: "member" as const,
    isOwner: false,
    teamsEnabled: true,
    inWorkspace: true,
    permissions,
    permissionsDto: toPermissionsDto(permissions),
  };
}

function mockSelectCounts(memberCount: number, inviteCount: number) {
  let call = 0;
  mockDb.select.mockImplementation(() => {
    const count = call++ === 0 ? memberCount : inviteCount;
    const selectWhere = vi.fn().mockResolvedValue([{ count }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    return { from: selectFrom };
  });
}

function mockTeamAdminAccess(
  row: {
    teamId: string;
    teamName: string;
    ownerUserId: string;
    role: "admin" | "member";
  } | null,
) {
  mockDb.select.mockImplementation(() => {
    const limit = vi.fn().mockResolvedValue(row ? [row] : []);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    return { from };
  });
}

describe("team-service authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscriptionForUser.mockResolvedValue({ tier: "pro" });
    mockEnsureOwnerWorkspace.mockResolvedValue({
      workspaceId: "ws-1",
      created: false,
    });
    mockSendInviteEmail.mockResolvedValue(undefined);
  });

  it("forbids members from inviting", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(memberCtx());
    await expect(
      inviteMember("member-1", "new@example.com", "member"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("prevents duplicate active invites", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(adminCtx());
    mockDb.query.user.findFirst.mockResolvedValue(null);
    mockDb.query.teamInvitations.findFirst.mockResolvedValue({
      id: "invite-1",
    });
    mockSelectCounts(0, 0);

    await expect(
      inviteMember("owner-1", "new@example.com", "member"),
    ).rejects.toBeInstanceOf(TeamServiceError);
    await expect(
      inviteMember("owner-1", "new@example.com", "member"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("prevents inviting an existing member", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(adminCtx());
    mockDb.query.user.findFirst.mockResolvedValue({
      id: "member-1",
      email: "member@example.com",
    });
    mockDb.query.teamMembers.findFirst.mockResolvedValue({ id: "m1" });

    await expect(
      inviteMember("owner-1", "member@example.com", "member"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects expired invitations on accept", async () => {
    mockDb.query.teamInvitations.findFirst.mockResolvedValue({
      id: "invite-1",
      teamId: "team-1",
      email: "member@example.com",
      role: "member",
      token: "tok",
      revokedAt: null,
      acceptedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(acceptInvite("member-1", "tok")).rejects.toMatchObject({
      statusCode: 410,
    });
  });

  it("rejects revoked invitations on accept", async () => {
    mockDb.query.teamInvitations.findFirst.mockResolvedValue({
      id: "invite-1",
      teamId: "team-1",
      email: "member@example.com",
      role: "member",
      token: "tok",
      revokedAt: new Date(),
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(acceptInvite("member-1", "tok")).rejects.toMatchObject({
      statusCode: 410,
    });
  });

  it("does not allow removing the team owner", async () => {
    mockDb.query.teamMembers.findFirst.mockResolvedValue({
      id: "mem-owner",
      userId: "owner-1",
      role: "admin",
      teamId: "team-1",
    });
    mockTeamAdminAccess({
      teamId: "team-1",
      teamName: "Acme",
      ownerUserId: "owner-1",
      role: "admin",
    });

    await expect(removeMember("owner-1", "mem-owner")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("does not allow demoting the team owner", async () => {
    mockDb.query.teamMembers.findFirst.mockResolvedValue({
      id: "mem-owner",
      userId: "owner-1",
      role: "admin",
      teamId: "team-1",
    });
    mockTeamAdminAccess({
      teamId: "team-1",
      teamName: "Acme",
      ownerUserId: "owner-1",
      role: "admin",
    });

    await expect(
      updateMemberRole("owner-1", "mem-owner", "member"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("forbids members from changing roles", async () => {
    mockDb.query.teamMembers.findFirst.mockResolvedValue({
      id: "mem-2",
      userId: "member-2",
      role: "member",
      teamId: "team-1",
    });
    mockTeamAdminAccess({
      teamId: "team-1",
      teamName: "Acme",
      ownerUserId: "owner-1",
      role: "member",
    });
    await expect(
      updateMemberRole("member-1", "mem-2", "admin"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows role changes when active workspace is a different team", async () => {
    mockDb.query.teamMembers.findFirst.mockResolvedValue({
      id: "mem-2",
      userId: "member-2",
      role: "member",
      teamId: "team-2",
    });
    mockTeamAdminAccess({
      teamId: "team-2",
      teamName: "Other",
      ownerUserId: "owner-1",
      role: "admin",
    });
    mockDb.query.user.findFirst.mockResolvedValue({
      email: "member2@example.com",
    });
    const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    mockDb.update.mockReturnValue({ set });

    await expect(
      updateMemberRole("owner-1", "mem-2", "admin"),
    ).resolves.toBeUndefined();
    expect(mockDb.update).toHaveBeenCalled();
  });
});
