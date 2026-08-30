import { fetchApi } from "@/lib/fetch-api";
import type { WorkspaceRole } from "@/lib/workspace-roles";

export type { WorkspaceRole };

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
  canViewAnalytics: boolean;
  canViewInbox: boolean;
  canReplyComments: boolean;
  canReplyDms: boolean;
};

export type TeamWorkspace = {
  id: string;
  name: string;
  connectionCount: number;
  isActive: boolean;
};

export type TeamGetResponse = {
  team: {
    id: string;
    name: string;
    ownerUserId: string;
    defaultWorkspaceId?: string | null;
  } | null;
  workspace: { id: string; name: string; teamId: string } | null;
  workspaces: TeamWorkspace[];
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
  teamId: string | null;
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

export async function getTeamById(teamId: string): Promise<TeamGetResponse> {
  const res = await fetchApi(`/api/team/${teamId}`);
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to load team"));
  }
  return res.json() as Promise<TeamGetResponse>;
}

export async function getTeamInvitations(
  teamId?: string,
): Promise<TeamInvitationsResponse> {
  const res = await fetchApi(
    teamId ? `/api/team/${teamId}/invitations` : "/api/team/invitations",
  );
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
  teamId?: string;
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

export async function acceptTeamInvite(
  token: string,
): Promise<{ workspaceId: string; teamId: string }> {
  const res = await fetchApi("/api/team/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to accept invitation"));
  }
  return res.json() as Promise<{ workspaceId: string; teamId: string }>;
}

export type MyPendingInvitation = {
  id: string;
  teamId: string;
  teamName: string;
  workspaceId: string | null;
  workspaceName: string;
  role: WorkspaceRole;
  inviterName: string | null;
  expiresAt: string;
  createdAt: string;
};

export async function listMyPendingInvitations(): Promise<{
  invitations: MyPendingInvitation[];
}> {
  const res = await fetchApi("/api/team/my-invitations");
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to load invitations"));
  }
  return res.json() as Promise<{ invitations: MyPendingInvitation[] }>;
}

export async function acceptMyInvitation(
  invitationId: string,
): Promise<{ workspaceId: string; teamId: string }> {
  const res = await fetchApi(`/api/team/my-invitations/${invitationId}/accept`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to accept invitation"));
  }
  return res.json() as Promise<{ workspaceId: string; teamId: string }>;
}

export async function declineMyInvitation(invitationId: string): Promise<void> {
  const res = await fetchApi(
    `/api/team/my-invitations/${invitationId}/decline`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to decline invitation"));
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
  teamId: string | null;
  teamName: string | null;
  role: WorkspaceRole | null;
  isOwner: boolean;
  isActive: boolean;
  connectionCount: number;
  memberCount: number;
  icon: string;
};

export type TeamListItem = {
  id: string;
  name: string;
  kind: "owned" | "joined";
  role: WorkspaceRole;
  isOwner: boolean;
  ownerUserId?: string;
  defaultWorkspaceId?: string | null;
  /** False = solo workspace container; not listed on /teams. */
  isCollaborative: boolean;
  memberCount: number;
  workspaces: {
    id: string;
    name: string;
    connectionCount: number;
    isActive: boolean;
    icon: string;
  }[];
};

export type WorkspacesListResponse = {
  workspaces: WorkspaceListItem[];
  teams: TeamListItem[];
  canCreate: boolean;
  canCreateTeam: boolean;
  ownedTeamCount: number;
  maxOwnedTeams: number;
};

export async function listWorkspaces(): Promise<WorkspacesListResponse> {
  const res = await fetchApi("/api/team/workspaces");
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to load workspaces"));
  }
  return res.json() as Promise<WorkspacesListResponse>;
}

export type WorkspaceBoardAccount = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

export type WorkspaceBoardCard = {
  id: string | null;
  name: string;
  kind: "personal" | "owned" | "joined";
  teamId: string | null;
  teamName: string | null;
  /** Account owner for connections in this card. */
  ownerUserId: string;
  isOwner: boolean;
  canManage: boolean;
  canRename: boolean;
  canDelete: boolean;
  isActive: boolean;
  connectionCount: number;
  accounts: WorkspaceBoardAccount[];
  icon: string;
};

export type WorkspaceBoardResponse = {
  cards: WorkspaceBoardCard[];
  canCreate: boolean;
  canCreateTeam: boolean;
  ownedTeamCount: number;
  maxOwnedTeams: number;
};

export async function listWorkspaceBoard(): Promise<WorkspaceBoardResponse> {
  const res = await fetchApi("/api/team/workspaces/board");
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to load workspaces"));
  }
  return res.json() as Promise<WorkspaceBoardResponse>;
}

export async function moveAccountToWorkspace(
  accountId: string,
  workspaceId: string | null,
): Promise<{ workspaceId: string | null }> {
  const res = await fetchApi(`/api/team/accounts/${accountId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to move connection"));
  }
  return res.json() as Promise<{ workspaceId: string | null }>;
}

export async function createTeam(
  name: string,
  workspaceName?: string,
  opts?: { isCollaborative?: boolean; icon?: string },
): Promise<{ teamId: string; workspaceId: string }> {
  const res = await fetchApi("/api/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      ...(workspaceName?.trim() ? { workspaceName: workspaceName.trim() } : {}),
      ...(opts?.isCollaborative === false ? { isCollaborative: false } : {}),
      ...(opts?.icon ? { icon: opts.icon } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to create team"));
  }
  return res.json() as Promise<{ teamId: string; workspaceId: string }>;
}

/** @deprecated prefer createTeam */
export async function createWorkspace(
  name: string,
  workspaceName?: string,
): Promise<{ workspaceId: string; teamId?: string }> {
  return createTeam(name, workspaceName);
}

export async function createWorkspaceInTeam(
  teamId: string,
  name: string,
  icon?: string,
): Promise<{ workspaceId: string }> {
  const res = await fetchApi(`/api/team/${teamId}/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...(icon ? { icon } : {}) }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to create workspace"));
  }
  return res.json() as Promise<{ workspaceId: string }>;
}

export async function renameTeam(
  teamId: string,
  name: string,
): Promise<{ name: string }> {
  const res = await fetchApi(`/api/team/${teamId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to rename team"));
  }
  return res.json() as Promise<{ name: string }>;
}

export async function renameWorkspace(
  workspaceId: string,
  name: string,
): Promise<{ name: string }> {
  const res = await fetchApi(`/api/team/workspaces/${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to rename workspace"));
  }
  return res.json() as Promise<{ name: string }>;
}

export async function deleteWorkspace(
  workspaceId: string,
): Promise<{ moved: number; skipped: number }> {
  const res = await fetchApi(`/api/team/workspaces/${workspaceId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to delete workspace"));
  }
  return res.json() as Promise<{ moved: number; skipped: number }>;
}

export async function deleteTeam(
  teamId: string,
  opts?: { keepConnections?: boolean },
): Promise<{ moved: number; skipped: number }> {
  const res = await fetchApi(`/api/team/${teamId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keepConnections: opts?.keepConnections === true,
    }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to delete team"));
  }
  return res.json() as Promise<{ moved: number; skipped: number }>;
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

export async function leaveTeam(teamId: string): Promise<void> {
  const res = await fetchApi("/api/team/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to leave team"));
  }
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
