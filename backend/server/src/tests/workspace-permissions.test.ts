import { describe, expect, it } from "vitest";
import {
  hasPermission,
  permissionsForRole,
  toPermissionsDto,
} from "../lib/workspace/permissions.js";

describe("workspace permissions", () => {
  it("gives personal accounts full control outside a workspace", () => {
    const perms = permissionsForRole(null, {
      isOwner: true,
      teamsEnabled: false,
      inWorkspace: false,
    });
    expect(hasPermission(perms, "access_billing")).toBe(true);
    expect(hasPermission(perms, "manage_connections")).toBe(true);
    expect(hasPermission(perms, "create_posts")).toBe(true);
  });

  it("disables collaboration when Pro lapses on a workspace", () => {
    const perms = permissionsForRole("admin", {
      isOwner: false,
      teamsEnabled: false,
      inWorkspace: true,
    });
    expect(perms.size).toBe(0);
  });

  it("gives owners billing + admin capabilities when Teams is enabled", () => {
    const perms = permissionsForRole("admin", {
      isOwner: true,
      teamsEnabled: true,
      inWorkspace: true,
    });
    const dto = toPermissionsDto(perms);
    expect(dto.canAccessBilling).toBe(true);
    expect(dto.canInvite).toBe(true);
    expect(dto.canManageConnections).toBe(true);
    expect(dto.canCreatePosts).toBe(true);
  });

  it("gives non-owner admins team management without billing", () => {
    const perms = permissionsForRole("admin", {
      isOwner: false,
      teamsEnabled: true,
      inWorkspace: true,
    });
    const dto = toPermissionsDto(perms);
    expect(dto.canAccessBilling).toBe(false);
    expect(dto.canInvite).toBe(true);
    expect(dto.canRemoveMembers).toBe(true);
    expect(dto.canChangeRoles).toBe(true);
    expect(dto.canManageConnections).toBe(true);
    expect(dto.canManageWorkspaceSettings).toBe(true);
  });

  it("restricts members from admin-only actions", () => {
    const perms = permissionsForRole("member", {
      isOwner: false,
      teamsEnabled: true,
      inWorkspace: true,
    });
    const dto = toPermissionsDto(perms);
    expect(dto.canInvite).toBe(false);
    expect(dto.canRemoveMembers).toBe(false);
    expect(dto.canChangeRoles).toBe(false);
    expect(dto.canManageConnections).toBe(false);
    expect(dto.canAccessBilling).toBe(false);
    expect(dto.canManageWorkspaceSettings).toBe(false);
    expect(dto.canCreatePosts).toBe(true);
    expect(dto.canEditPosts).toBe(true);
    expect(dto.canDeletePosts).toBe(true);
    expect(dto.canPublishPosts).toBe(true);
    expect(dto.canViewConnections).toBe(true);
  });
});

describe("plan allowTeams", () => {
  it("is enabled only for pro", async () => {
    const { getPlanLimits } = await import("@social0/shared");
    expect(getPlanLimits("free").allowTeams).toBe(false);
    expect(getPlanLimits("starter").allowTeams).toBe(false);
    expect(getPlanLimits("growth").allowTeams).toBe(false);
    expect(getPlanLimits("pro").allowTeams).toBe(true);
  });
});

describe("plan allowMultiWorkspace", () => {
  it("is enabled for paid plans only", async () => {
    const { getPlanLimits } = await import("@social0/shared");
    expect(getPlanLimits("free").allowMultiWorkspace).toBe(false);
    expect(getPlanLimits("starter").allowMultiWorkspace).toBe(true);
    expect(getPlanLimits("growth").allowMultiWorkspace).toBe(true);
    expect(getPlanLimits("pro").allowMultiWorkspace).toBe(true);
  });
});
