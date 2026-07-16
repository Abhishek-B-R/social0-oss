import { fetchApi } from "@/lib/fetch-api";

export type WorkspaceRole = "admin" | "member";

export type TeamMember = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: WorkspaceRole;
  isOwner: boolean;
  createdAt: string;
};

export type TeamInvitation = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
  invitedByName: string | null;
};

export type TeamPermissions = {
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

export type TeamGetResponse = {
  workspace: { id: string; name: string; ownerUserId: string } | null;
  members: TeamMember[];
  permissions: TeamPermissions;
  teamsEnabled: boolean;
  upgradeRequired: boolean;
  role: WorkspaceRole | null;
  isOwner: boolean;
};

export type TeamContextResponse = {
  role: WorkspaceRole | null;
  permissions: TeamPermissions | null;
  resourceOwnerId: string | null;
  teamsEnabled: boolean;
  workspaceId: string | null;
  isOwner: boolean;
};

export type TeamInvitationsResponse = {
  invitations: TeamInvitation[];
};

async function parseError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof data.error === "string" && data.error.trim()
    ? data.error
    : fallback;
}

export async function getTeam(): Promise<TeamGetResponse> {
  const res = await fetchApi("/api/team");
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to load team"));
  }
  return res.json() as Promise<TeamGetResponse>;
}

export async function getTeamInvitations(): Promise<TeamInvitationsResponse> {
  const res = await fetchApi("/api/team/invitations");
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to load invitations"));
  }
  return res.json() as Promise<TeamInvitationsResponse>;
}

export async function getTeamContext(): Promise<TeamContextResponse> {
  const res = await fetchApi("/api/team/context");
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to load team context"));
  }
  return res.json() as Promise<TeamContextResponse>;
}

export async function inviteTeamMember(body: {
  email: string;
  role: WorkspaceRole;
}): Promise<void> {
  const res = await fetchApi("/api/team/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to send invitation"));
  }
}

export async function acceptTeamInvite(token: string): Promise<void> {
  const res = await fetchApi("/api/team/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to accept invitation"));
  }
}

export async function updateTeamMemberRole(
  memberId: string,
  role: WorkspaceRole,
): Promise<void> {
  const res = await fetchApi(`/api/team/member/${memberId}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to update role"));
  }
}

export async function removeTeamMember(memberId: string): Promise<void> {
  const res = await fetchApi(`/api/team/member/${memberId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to remove member"));
  }
}

export async function revokeTeamInvitation(invitationId: string): Promise<void> {
  const res = await fetchApi(`/api/team/invitation/${invitationId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to revoke invitation"));
  }
}

export type WorkspaceListItem = {
  id: string | null;
  name: string;
  kind: "personal" | "owned" | "joined";
  role: WorkspaceRole | null;
  isOwner: boolean;
  isActive: boolean;
  connectionCount: number;
};

export type WorkspacesListResponse = {
  workspaces: WorkspaceListItem[];
  canCreate: boolean;
};

export async function listWorkspaces(): Promise<WorkspacesListResponse> {
  const res = await fetchApi("/api/team/workspaces");
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to load workspaces"));
  }
  return res.json() as Promise<WorkspacesListResponse>;
}

export async function createWorkspace(name: string): Promise<{ workspaceId: string }> {
  const res = await fetchApi("/api/team/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to create workspace"));
  }
  return res.json() as Promise<{ workspaceId: string }>;
}

export async function switchWorkspace(
  workspaceId: string | null,
): Promise<{ workspaceId: string | null }> {
  const res = await fetchApi("/api/team/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to switch workspace"));
  }
  return res.json() as Promise<{ workspaceId: string | null }>;
}

export async function leaveWorkspace(workspaceId: string): Promise<void> {
  const res = await fetchApi("/api/team/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to leave workspace"));
  }
}
