/**
 * Centralized Teams / Workspace authorization helpers.
 * Prefer these over scattered `role === "admin"` checks.
 */

export type WorkspaceRole = "admin" | "member";

export type WorkspacePermission =
  | "invite_users"
  | "remove_users"
  | "change_roles"
  | "manage_connections"
  | "view_connections"
  | "create_posts"
  | "edit_posts"
  | "delete_posts"
  | "publish_posts"
  | "view_posts"
  | "manage_workspace_settings"
  | "access_billing";

const ADMIN_PERMISSIONS = new Set<WorkspacePermission>([
  "invite_users",
  "remove_users",
  "change_roles",
  "manage_connections",
  "view_connections",
  "create_posts",
  "edit_posts",
  "delete_posts",
  "publish_posts",
  "view_posts",
  "manage_workspace_settings",
]);

const MEMBER_PERMISSIONS = new Set<WorkspacePermission>([
  "view_connections",
  "create_posts",
  "edit_posts",
  "delete_posts",
  "publish_posts",
  "view_posts",
]);

/** Owner always has Admin capabilities plus billing. */
const OWNER_PERMISSIONS = new Set<WorkspacePermission>([
  ...ADMIN_PERMISSIONS,
  "access_billing",
]);

/** Solo (non-workspace) users keep full personal account control. */
const PERSONAL_PERMISSIONS = new Set<WorkspacePermission>([
  ...OWNER_PERMISSIONS,
]);

export type TeamPermissionsDto = {
  canInvite: boolean;
  canRemoveMembers: boolean;
  canChangeRoles: boolean;
  canManageConnections: boolean;
  canManageWorkspaceSettings: boolean;
  canAccessBilling: boolean;
  canCreatePosts: boolean;
  canEditPosts: boolean;
  canDeletePosts: boolean;
  canPublishPosts: boolean;
  canViewConnections: boolean;
};

export function permissionsForRole(
  role: WorkspaceRole | null,
  opts: { isOwner: boolean; teamsEnabled: boolean; inWorkspace: boolean },
): Set<WorkspacePermission> {
  if (!opts.inWorkspace) {
    return new Set(PERSONAL_PERMISSIONS);
  }

  // Owner always keeps control of their own workspaces (solo or team).
  // Teammates only collaborate while the owner's Pro (allowTeams) is active.
  if (!opts.teamsEnabled) {
    if (opts.isOwner) {
      return new Set(OWNER_PERMISSIONS);
    }
    return new Set<WorkspacePermission>();
  }

  if (opts.isOwner) {
    return new Set(OWNER_PERMISSIONS);
  }

  if (role === "admin") {
    return new Set(ADMIN_PERMISSIONS);
  }

  if (role === "member") {
    return new Set(MEMBER_PERMISSIONS);
  }

  return new Set<WorkspacePermission>();
}

export function hasPermission(
  granted: Set<WorkspacePermission>,
  permission: WorkspacePermission,
): boolean {
  return granted.has(permission);
}

export function assertPermission(
  granted: Set<WorkspacePermission>,
  permission: WorkspacePermission,
): void {
  if (!hasPermission(granted, permission)) {
    const err = new Error("Forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
}

export function toPermissionsDto(
  granted: Set<WorkspacePermission>,
): TeamPermissionsDto {
  return {
    canInvite: granted.has("invite_users"),
    canRemoveMembers: granted.has("remove_users"),
    canChangeRoles: granted.has("change_roles"),
    canManageConnections: granted.has("manage_connections"),
    canManageWorkspaceSettings: granted.has("manage_workspace_settings"),
    canAccessBilling: granted.has("access_billing"),
    canCreatePosts: granted.has("create_posts"),
    canEditPosts: granted.has("edit_posts"),
    canDeletePosts: granted.has("delete_posts"),
    canPublishPosts: granted.has("publish_posts"),
    canViewConnections: granted.has("view_connections"),
  };
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === "admin" || value === "member";
}
