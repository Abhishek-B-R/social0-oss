import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockResolveWorkspaceContext,
  mockEnsureOwnerWorkspace,
  mockGetSubscriptionForUser,
  mockDb,
  mockSendInviteEmail,
} = vi.hoisted(() => ({
  mockResolveWorkspaceContext: vi.fn(),
  mockEnsureOwnerWorkspace: vi.fn(),
  mockGetSubscriptionForUser: vi.fn(),
  mockSendInviteEmail: vi.fn(),
  mockDb: {
    query: {
      user: { findFirst: vi.fn() },
      workspaceMembers: { findFirst: vi.fn() },
      workspaceInvitations: { findFirst: vi.fn() },
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
}));
vi.mock("../lib/workspace/emails.js", () => ({
  sendWorkspaceInviteEmail: mockSendInviteEmail,
  sendWorkspaceInviteAcceptedEmail: vi.fn(),
  sendWorkspaceMemberRemovedEmail: vi.fn(),
  sendWorkspaceRoleChangedEmail: vi.fn(),
}));

import {
  TeamServiceError,
  acceptInvite,
  inviteMember,
  removeMember,
  updateMemberRole,
} from "../lib/workspace/team-service.js";
import { permissionsForRole, toPermissionsDto } from "../lib/workspace/permissions.js";

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
    workspaceName: "Acme",
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
    workspaceName: "Acme",
    ownerUserId: "owner-1",
    role: "member" as const,
    isOwner: false,
    teamsEnabled: true,
    inWorkspace: true,
    permissions,
    permissionsDto: toPermissionsDto(permissions),
  };
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
    mockDb.query.workspaceInvitations.findFirst.mockResolvedValue({
      id: "invite-1",
    });

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
    mockDb.query.workspaceMembers.findFirst.mockResolvedValue({ id: "m1" });

    await expect(
      inviteMember("owner-1", "member@example.com", "member"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects expired invitations on accept", async () => {
    mockDb.query.workspaceInvitations.findFirst.mockResolvedValue({
      id: "invite-1",
      workspaceId: "ws-1",
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
    mockDb.query.workspaceInvitations.findFirst.mockResolvedValue({
      id: "invite-1",
      workspaceId: "ws-1",
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

  it("does not allow removing the workspace owner", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(adminCtx());
    mockDb.query.workspaceMembers.findFirst.mockResolvedValue({
      id: "mem-owner",
      userId: "owner-1",
      role: "admin",
      workspaceId: "ws-1",
    });

    await expect(removeMember("owner-1", "mem-owner")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("does not allow demoting the workspace owner", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(adminCtx());
    mockDb.query.workspaceMembers.findFirst.mockResolvedValue({
      id: "mem-owner",
      userId: "owner-1",
      role: "admin",
      workspaceId: "ws-1",
    });

    await expect(
      updateMemberRole("owner-1", "mem-owner", "member"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("does not allow demoting the last admin", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(adminCtx());
    mockDb.query.workspaceMembers.findFirst.mockResolvedValue({
      id: "mem-admin",
      userId: "admin-2",
      role: "admin",
      workspaceId: "ws-1",
    });

    const selectWhere = vi.fn().mockResolvedValue([{ value: 1 }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    mockDb.select.mockReturnValue({ from: selectFrom });

    await expect(
      updateMemberRole("owner-1", "mem-admin", "member"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("forbids members from changing roles", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(memberCtx());
    await expect(
      updateMemberRole("member-1", "mem-2", "admin"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
