export const WORKSPACE_ROLES = [
  "admin",
  "member",
  "community",
  "analyst",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_ROLE_META: Record<
  WorkspaceRole,
  { label: string; description: string }
> = {
  admin: {
    label: "Admin",
    description: "Manage the team, connections, posts, analytics, and inbox.",
  },
  member: {
    label: "Member",
    description: "Create and publish posts, plus analytics and inbox.",
  },
  community: {
    label: "Community",
    description: "Reply to comments and DMs. Cannot publish posts.",
  },
  analyst: {
    label: "Analyst",
    description: "View analytics. Cannot publish or reply in inbox.",
  },
};

export function workspaceRoleLabel(role: string): string {
  return WORKSPACE_ROLE_META[role as WorkspaceRole]?.label ?? role;
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}
