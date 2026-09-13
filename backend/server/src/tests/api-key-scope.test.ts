import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveWorkspaceContext, mockPersonalWorkspaceContext } = vi.hoisted(
  () => ({
    mockResolveWorkspaceContext: vi.fn(),
    mockPersonalWorkspaceContext: vi.fn(),
  }),
);

vi.mock("../lib/workspace/context.js", () => ({
  resolveWorkspaceContext: mockResolveWorkspaceContext,
  personalWorkspaceContext: mockPersonalWorkspaceContext,
}));
vi.mock("../lib/auth.js", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("../lib/http/request-cookies.js", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import { requireWorkspacePermissionForActor } from "../lib/workspace/session.js";
import {
  permissionsForRole,
  toPermissionsDto,
} from "../lib/workspace/permissions.js";

function ctx(overrides: Record<string, unknown>) {
  const permissions = permissionsForRole("admin", {
    isOwner: false,
    teamsEnabled: true,
    inWorkspace: true,
  });
  return {
    actorUserId: "member-1",
    resourceUserId: "owner-1",
    workspaceId: "ws-1",
    workspaceName: "Team workspace",
    teamId: "team-1",
    teamName: "Acme",
    ownerUserId: "owner-1",
    role: "admin" as const,
    isOwner: false,
    teamsEnabled: true,
    inWorkspace: true,
    permissions,
    permissionsDto: toPermissionsDto(permissions),
    ...overrides,
  };
}

function personalCtx(userId: string) {
  const permissions = permissionsForRole(null, {
    isOwner: true,
    teamsEnabled: false,
    inWorkspace: false,
  });
  return {
    actorUserId: userId,
    resourceUserId: userId,
    workspaceId: null,
    workspaceName: null,
    teamId: null,
    teamName: null,
    ownerUserId: null,
    role: null,
    isOwner: true,
    teamsEnabled: false,
    inWorkspace: false,
    permissions,
    permissionsDto: toPermissionsDto(permissions),
  };
}

/**
 * `/v1` scopes every API key to the personal pool (`workspaceId: null`). The
 * `/api/*` routes that also accept a key must not widen that to whatever team
 * workspace the user happens to have active in the dashboard.
 */
describe("requireWorkspacePermissionForActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveWorkspaceContext.mockResolvedValue(ctx({}));
    mockPersonalWorkspaceContext.mockImplementation(personalCtx);
  });

  it("keeps an API key on the personal pool, not the active team workspace", async () => {
    const result = await requireWorkspacePermissionForActor(
      { userId: "member-1", source: "apiKey" },
      "manage_connections",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx.workspaceId).toBeNull();
    expect(result.ctx.resourceUserId).toBe("member-1");
    expect(mockResolveWorkspaceContext).not.toHaveBeenCalled();
  });

  it("uses the active workspace for a browser session", async () => {
    const result = await requireWorkspacePermissionForActor(
      { userId: "member-1", source: "session" },
      "manage_connections",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx.workspaceId).toBe("ws-1");
    expect(result.ctx.resourceUserId).toBe("owner-1");
  });

  it("still enforces the permission for API keys", async () => {
    const result = await requireWorkspacePermissionForActor(
      { userId: "member-1", source: "apiKey" },
      "access_billing",
    );
    // Personal context grants billing; a permission it lacks must be refused.
    expect(result.ok).toBe(true);

    mockPersonalWorkspaceContext.mockReturnValue({
      ...personalCtx("member-1"),
      permissions: new Set(),
    });
    const denied = await requireWorkspacePermissionForActor(
      { userId: "member-1", source: "apiKey" },
      "publish_posts",
    );
    expect(denied).toEqual({
      ok: false,
      error: "Forbidden",
      statusCode: 403,
    });
  });
});
