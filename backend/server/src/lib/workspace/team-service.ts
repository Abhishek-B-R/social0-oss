import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  connectedAccounts,
  posts,
  postPublications,
  teamInvitations,
  teamMembers,
  teams,
  user,
  userSettings,
  workspaces,
} from "../../db/schema.js";
import { getSubscriptionForUser } from "../subscription.js";
import { getPlanLimits } from "@social0/shared";
import {
  ensureOwnerTeam,
  resolveWorkspaceContext,
  setActiveWorkspace,
  defaultWorkspaceNameForTeam,
} from "./context.js";
import {
  isWorkspaceRole,
  permissionsForRole,
  toPermissionsDto,
  workspaceRoleLabel,
  workspaceRoleRank,
  type TeamPermissionsDto,
  type WorkspaceRole,
} from "./permissions.js";
import {
  sendWorkspaceInviteAcceptedEmail,
  sendWorkspaceInviteEmail,
  sendWorkspaceMemberRemovedEmail,
  sendWorkspaceRoleChangedEmail,
} from "./emails.js";
import {
  getCachedTeamMembers,
  getCachedTeamMeta,
  getCachedTeamWorkspaces,
  getCachedWorkspaceMeta,
  invalidateTeamMembersCache,
  invalidateTeamRoomCache,
  invalidateTeamWorkspacesCache,
  setCachedTeamMembers,
  setCachedTeamMeta,
  setCachedTeamWorkspaces,
  setCachedWorkspaceMeta,
  type CachedTeamMeta,
} from "./room-cache.js";

export const INVITE_EXPIRY_DAYS = Number(
  process.env.WORKSPACE_INVITE_EXPIRY_DAYS ?? "7",
);

/** Max teammates (excluding the owner) per team, counting active invites. */
export const MAX_TEAM_MEMBERS = 15;

/** Max owned teams per Pro user. */
export const MAX_OWNED_TEAMS = 5;

export type TeamMemberDto = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: WorkspaceRole;
  isOwner: boolean;
  createdAt: string;
};

export type TeamInvitationDto = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
  invitedByName: string | null;
};

export type TeamWorkspaceDto = {
  id: string;
  name: string;
  connectionCount: number;
  isActive: boolean;
  icon: string;
};

export type TeamGetResponse = {
  team: {
    id: string;
    name: string;
    ownerUserId: string;
    defaultWorkspaceId?: string | null;
  } | null;
  workspace: { id: string; name: string; teamId: string; icon: string } | null;
  workspaces: TeamWorkspaceDto[];
  members: TeamMemberDto[];
  permissions: TeamPermissionsDto;
  teamsEnabled: boolean;
  upgradeRequired: boolean;
  role: WorkspaceRole | null;
  isOwner: boolean;
};

/** Allowlisted Phosphor icon keys for workspaces. */
export const WORKSPACE_ICON_IDS = [
  "briefcase",
  "house",
  "buildings",
  "users",
  "megaphone",
  "palette",
  "code",
  "camera",
  "chart-line",
  "rocket",
] as const;

export type WorkspaceIconId = (typeof WORKSPACE_ICON_IDS)[number];

const WORKSPACE_ICON_SET = new Set<string>(WORKSPACE_ICON_IDS);

export function normalizeWorkspaceIcon(raw: unknown): WorkspaceIconId {
  if (typeof raw === "string" && WORKSPACE_ICON_SET.has(raw)) {
    return raw as WorkspaceIconId;
  }
  return "briefcase";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function newInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export class TeamServiceError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function requireAdminTeamsContext(actorUserId: string) {
  const sub = await getSubscriptionForUser(actorUserId);
  if (getPlanLimits(sub.tier).allowTeams) {
    await ensureOwnerTeam(actorUserId);
  }

  const ctx = await resolveWorkspaceContext(actorUserId);
  if (!ctx.permissions.has("invite_users")) {
    if (!getPlanLimits(sub.tier).allowTeams && !ctx.inWorkspace) {
      throw new TeamServiceError(
        403,
        "Teams is available on the Pro plan. Upgrade to invite teammates.",
      );
    }
    throw new TeamServiceError(403, "Forbidden");
  }
  if (!ctx.teamId || !ctx.ownerUserId) {
    throw new TeamServiceError(403, "Forbidden");
  }
  if (!ctx.teamsEnabled) {
    throw new TeamServiceError(
      403,
      "Teams is paused because the workspace Pro subscription is inactive.",
    );
  }
  return ctx;
}

/**
 * Authorize an admin action against a specific team (not the active workspace).
 * Team settings pages often operate while the actor's active workspace is Main
 * or another team — member/invite IDs must resolve by their own teamId.
 */
async function requireTeamAdminPermission(
  actorUserId: string,
  teamId: string,
  permission: "invite_users" | "remove_users" | "change_roles",
): Promise<{
  teamId: string;
  teamName: string;
  ownerUserId: string;
}> {
  const [access] = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      ownerUserId: teams.ownerUserId,
      role: teamMembers.role,
    })
    .from(teams)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, teams.id),
        eq(teamMembers.userId, actorUserId),
      ),
    )
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!access) {
    throw new TeamServiceError(404, "Team not found.");
  }

  const isOwner = access.ownerUserId === actorUserId;
  const ownerSub = isOwner
    ? await getSubscriptionForUser(actorUserId)
    : await getSubscriptionForUser(access.ownerUserId);
  const teamsEnabled = getPlanLimits(ownerSub.tier).allowTeams;

  if (!teamsEnabled) {
    throw new TeamServiceError(
      403,
      "Teams is paused because the workspace Pro subscription is inactive.",
    );
  }

  const permissions = permissionsForRole(access.role as WorkspaceRole, {
    isOwner,
    teamsEnabled,
    inWorkspace: true,
  });
  if (!permissions.has(permission)) {
    throw new TeamServiceError(403, "Forbidden");
  }

  return {
    teamId: access.teamId,
    teamName: access.teamName,
    ownerUserId: access.ownerUserId,
  };
}

async function loadTeamMembers(teamId: string, ownerUserId: string) {
  const cached = await getCachedTeamMembers(teamId);
  if (cached) return cached;

  const memberRows = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      createdAt: teamMembers.createdAt,
      email: user.email,
      name: user.name,
      image: user.image,
    })
    .from(teamMembers)
    .innerJoin(user, eq(teamMembers.userId, user.id))
    .where(eq(teamMembers.teamId, teamId));

  const members: TeamMemberDto[] = memberRows.map((row) => ({
    id: row.id,
    userId: row.userId,
    email: row.email,
    name: row.name,
    image: row.image,
    role: row.role as WorkspaceRole,
    isOwner: row.userId === ownerUserId,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  }));

  members.sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if (a.role !== b.role) return workspaceRoleRank(a.role) - workspaceRoleRank(b.role);
    return a.email.localeCompare(b.email);
  });

  await setCachedTeamMembers(teamId, members);
  return members;
}

async function loadTeamWorkspaces(
  teamId: string,
  activeWorkspaceId: string | null,
): Promise<TeamWorkspaceDto[]> {
  const cached = await getCachedTeamWorkspaces(teamId);
  if (cached) {
    return cached
      .map((row) => ({
        ...row,
        icon: normalizeWorkspaceIcon(row.icon),
        isActive: activeWorkspaceId === row.id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      icon: workspaces.icon,
    })
    .from(workspaces)
    .where(eq(workspaces.teamId, teamId));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const countRows = await db
    .select({
      workspaceId: connectedAccounts.workspaceId,
      count: sql<number>`count(*)::int`,
    })
    .from(connectedAccounts)
    .where(inArray(connectedAccounts.workspaceId, ids))
    .groupBy(connectedAccounts.workspaceId);
  const countById = new Map(
    countRows.map((r) => [r.workspaceId as string, r.count ?? 0]),
  );

  const items: TeamWorkspaceDto[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: normalizeWorkspaceIcon(row.icon),
    connectionCount: countById.get(row.id) ?? 0,
    isActive: activeWorkspaceId === row.id,
  }));
  items.sort((a, b) => a.name.localeCompare(b.name));

  await setCachedTeamWorkspaces(
    teamId,
    items.map(({ id, name, connectionCount, icon }) => ({
      id,
      name,
      connectionCount,
      icon,
    })),
  );
  await Promise.all(
    items.map((ws) =>
      setCachedWorkspaceMeta({
        id: ws.id,
        name: ws.name,
        teamId,
        icon: ws.icon,
      }),
    ),
  );

  return items;
}

async function loadTeamMeta(teamId: string): Promise<CachedTeamMeta | null> {
  const cached = await getCachedTeamMeta(teamId);
  if (cached) return cached;

  const row = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: {
      id: true,
      name: true,
      ownerUserId: true,
      defaultWorkspaceId: true,
      isCollaborative: true,
    },
  });
  if (!row) return null;

  const meta: CachedTeamMeta = {
    id: row.id,
    name: row.name,
    ownerUserId: row.ownerUserId,
    defaultWorkspaceId: row.defaultWorkspaceId ?? null,
    isCollaborative: row.isCollaborative,
  };
  await setCachedTeamMeta(meta);
  return meta;
}

async function loadWorkspaceMeta(workspaceId: string) {
  const cached = await getCachedWorkspaceMeta(workspaceId);
  if (cached) return cached;

  const [row] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      teamId: workspaces.teamId,
      icon: workspaces.icon,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!row) return null;

  const meta = {
    id: row.id,
    name: row.name,
    teamId: row.teamId,
    icon: normalizeWorkspaceIcon(row.icon),
  };
  await setCachedWorkspaceMeta(meta);
  return meta;
}

export async function getTeamForUser(
  actorUserId: string,
): Promise<TeamGetResponse> {
  const sub = await getSubscriptionForUser(actorUserId);
  const actorAllowTeams = getPlanLimits(sub.tier).allowTeams;
  const ctx = await resolveWorkspaceContext(actorUserId);

  if (!ctx.teamId || !ctx.ownerUserId) {
    return {
      team: null,
      workspace: null,
      workspaces: [],
      members: [],
      permissions: ctx.permissionsDto,
      teamsEnabled: actorAllowTeams,
      upgradeRequired: !actorAllowTeams,
      role: null,
      isOwner: true,
    };
  }

  const members = await loadTeamMembers(ctx.teamId, ctx.ownerUserId);
  const teamWorkspaces = await loadTeamWorkspaces(ctx.teamId, ctx.workspaceId);
  const activeWs = ctx.workspaceId
    ? teamWorkspaces.find((w) => w.id === ctx.workspaceId)
    : null;

  return {
    team: {
      id: ctx.teamId,
      name: ctx.teamName ?? "Team",
      ownerUserId: ctx.ownerUserId,
    },
    workspace: ctx.workspaceId
      ? {
          id: ctx.workspaceId,
          name: ctx.workspaceName ?? "Workspace",
          teamId: ctx.teamId,
          icon: activeWs?.icon ?? "briefcase",
        }
      : null,
    workspaces: teamWorkspaces,
    members,
    permissions: ctx.permissionsDto,
    teamsEnabled: ctx.teamsEnabled,
    upgradeRequired: false,
    role: ctx.role,
    isOwner: ctx.isOwner,
  };
}

export async function getTeamByIdForUser(
  actorUserId: string,
  teamId: string,
): Promise<TeamGetResponse> {
  const [access] = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      ownerUserId: teams.ownerUserId,
      defaultWorkspaceId: teams.defaultWorkspaceId,
      role: teamMembers.role,
    })
    .from(teams)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, teams.id),
        eq(teamMembers.userId, actorUserId),
      ),
    )
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!access) {
    throw new TeamServiceError(404, "Team not found.");
  }

  const isOwner = access.ownerUserId === actorUserId;
  const role = access.role as WorkspaceRole;

  const [actorSub, ownerSub, ctx, members, teamWorkspaces] = await Promise.all([
    getSubscriptionForUser(actorUserId),
    isOwner
      ? Promise.resolve(null)
      : getSubscriptionForUser(access.ownerUserId),
    resolveWorkspaceContext(actorUserId),
    loadTeamMembers(access.teamId, access.ownerUserId),
    loadTeamWorkspaces(access.teamId, null),
  ]);

  const actorAllowTeams = getPlanLimits(actorSub.tier).allowTeams;
  const teamsEnabled = isOwner
    ? actorAllowTeams
    : getPlanLimits(ownerSub!.tier).allowTeams;

  const permissions = permissionsForRole(role, {
    isOwner,
    teamsEnabled,
    inWorkspace: true,
  });

  const activeId =
    ctx.teamId === access.teamId ? ctx.workspaceId : null;
  if (activeId) {
    for (const ws of teamWorkspaces) {
      ws.isActive = ws.id === activeId;
    }
  }

  return {
    team: {
      id: access.teamId,
      name: access.teamName,
      ownerUserId: access.ownerUserId,
      defaultWorkspaceId: access.defaultWorkspaceId,
    },
    workspace:
      ctx.teamId === access.teamId && ctx.workspaceId
        ? {
            id: ctx.workspaceId,
            name: ctx.workspaceName ?? "Workspace",
            teamId: access.teamId,
            icon:
              teamWorkspaces.find((w) => w.id === ctx.workspaceId)?.icon ??
              "briefcase",
          }
        : teamWorkspaces[0]
          ? {
              id: teamWorkspaces[0].id,
              name: teamWorkspaces[0].name,
              teamId: access.teamId,
              icon: teamWorkspaces[0].icon,
            }
          : null,
    workspaces: teamWorkspaces,
    members,
    permissions: toPermissionsDto(permissions),
    teamsEnabled,
    upgradeRequired: !actorAllowTeams && !isOwner && !teamsEnabled,
    role,
    isOwner,
  };
}

export async function listInvitationsForUser(
  actorUserId: string,
): Promise<TeamInvitationDto[]> {
  const ctx = await resolveWorkspaceContext(actorUserId);
  if (!ctx.teamId) return [];
  if (!ctx.permissions.has("invite_users")) return [];

  const rows = await db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      expiresAt: teamInvitations.expiresAt,
      createdAt: teamInvitations.createdAt,
      invitedByName: user.name,
    })
    .from(teamInvitations)
    .leftJoin(user, eq(teamInvitations.invitedByUserId, user.id))
    .where(
      and(
        eq(teamInvitations.teamId, ctx.teamId),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
        gt(teamInvitations.expiresAt, new Date()),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as WorkspaceRole,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    invitedByName: row.invitedByName,
  }));
}

export async function listInvitationsForTeam(
  actorUserId: string,
  teamId: string,
): Promise<TeamInvitationDto[]> {
  const [access] = await db
    .select({
      ownerUserId: teams.ownerUserId,
      role: teamMembers.role,
    })
    .from(teams)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, teams.id),
        eq(teamMembers.userId, actorUserId),
      ),
    )
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!access) {
    throw new TeamServiceError(404, "Team not found.");
  }

  const isOwner = access.ownerUserId === actorUserId;
  const ownerSub = isOwner
    ? await getSubscriptionForUser(actorUserId)
    : await getSubscriptionForUser(access.ownerUserId);
  const teamsEnabled = getPlanLimits(ownerSub.tier).allowTeams;
  const permissions = permissionsForRole(access.role as WorkspaceRole, {
    isOwner,
    teamsEnabled,
    inWorkspace: true,
  });
  if (!permissions.has("invite_users")) return [];

  const rows = await db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      expiresAt: teamInvitations.expiresAt,
      createdAt: teamInvitations.createdAt,
      invitedByName: user.name,
    })
    .from(teamInvitations)
    .leftJoin(user, eq(teamInvitations.invitedByUserId, user.id))
    .where(
      and(
        eq(teamInvitations.teamId, teamId),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
        gt(teamInvitations.expiresAt, new Date()),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as WorkspaceRole,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    invitedByName: row.invitedByName,
  }));
}

export async function inviteMember(
  actorUserId: string,
  emailRaw: string,
  roleRaw: unknown,
  teamIdRaw?: string,
): Promise<{ invitationId: string }> {
  if (!isWorkspaceRole(roleRaw)) {
    throw new TeamServiceError(
      400,
      "Invalid role. Use admin, member, community, or analyst.",
    );
  }
  const email = normalizeEmail(emailRaw);
  if (!email || !email.includes("@")) {
    throw new TeamServiceError(400, "A valid email is required.");
  }

  let teamId: string;
  let ownerUserId: string;
  let teamName: string;

  if (teamIdRaw?.trim()) {
    const detail = await getTeamByIdForUser(actorUserId, teamIdRaw.trim());
    if (!detail.team || !detail.permissions.canInvite) {
      throw new TeamServiceError(403, "Forbidden");
    }
    if (!detail.teamsEnabled) {
      throw new TeamServiceError(
        403,
        "Teams is paused because the workspace Pro subscription is inactive.",
      );
    }
    teamId = detail.team.id;
    ownerUserId = detail.team.ownerUserId;
    teamName = detail.team.name;
  } else {
    const ctx = await requireAdminTeamsContext(actorUserId);
    teamId = ctx.teamId!;
    ownerUserId = ctx.ownerUserId!;
    teamName = ctx.teamName ?? "Team";
  }

  const teamRow = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { isCollaborative: true },
  });
  if (teamRow && !teamRow.isCollaborative) {
    throw new TeamServiceError(
      400,
      "This workspace is not a team. Create a team to invite members.",
    );
  }

  const existingUser = await db.query.user.findFirst({
    where: sql`lower(${user.email}) = ${email}`,
    columns: { id: true, email: true },
  });

  if (existingUser) {
    const alreadyMember = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, existingUser.id),
      ),
      columns: { id: true },
    });
    if (alreadyMember) {
      throw new TeamServiceError(409, "That user is already in this team.");
    }
  }

  const activeInvite = await db.query.teamInvitations.findFirst({
    where: and(
      eq(teamInvitations.teamId, teamId),
      sql`lower(${teamInvitations.email}) = ${email}`,
      isNull(teamInvitations.acceptedAt),
      isNull(teamInvitations.revokedAt),
      gt(teamInvitations.expiresAt, new Date()),
    ),
    columns: { id: true },
  });
  if (activeInvite) {
    throw new TeamServiceError(
      409,
      "An active invitation already exists for this email.",
    );
  }

  const [memberCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMembers)
    .where(
      and(eq(teamMembers.teamId, teamId), ne(teamMembers.userId, ownerUserId)),
    );
  const [pendingInviteRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.teamId, teamId),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
        gt(teamInvitations.expiresAt, new Date()),
      ),
    );
  const teammateCount =
    (memberCountRow?.count ?? 0) + (pendingInviteRow?.count ?? 0);
  if (teammateCount >= MAX_TEAM_MEMBERS) {
    throw new TeamServiceError(
      403,
      `You can invite up to ${MAX_TEAM_MEMBERS} teammates per team.`,
    );
  }

  const actor = await db.query.user.findFirst({
    where: eq(user.id, actorUserId),
    columns: { name: true, email: true },
  });

  const token = newInviteToken();
  const expiresAt = new Date(
    Date.now() + Math.max(1, INVITE_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
  );

  const [invite] = await db
    .insert(teamInvitations)
    .values({
      teamId,
      email,
      role: roleRaw,
      token,
      invitedByUserId: actorUserId,
      expiresAt,
    })
    .returning({ id: teamInvitations.id });

  try {
    await sendWorkspaceInviteEmail({
      to: email,
      workspaceName: teamName,
      inviterName: actor?.name?.trim() || actor?.email || "A teammate",
      role: workspaceRoleLabel(roleRaw),
    });
  } catch (err) {
    await db.delete(teamInvitations).where(eq(teamInvitations.id, invite.id));
    throw new TeamServiceError(
      502,
      err instanceof Error
        ? `Failed to send invitation email: ${err.message}`
        : "Failed to send invitation email",
    );
  }

  return { invitationId: invite.id };
}

export type MyPendingInvitationDto = {
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

export async function listMyPendingInvitations(
  actorUserId: string,
): Promise<MyPendingInvitationDto[]> {
  const actor = await db.query.user.findFirst({
    where: eq(user.id, actorUserId),
    columns: { email: true },
  });
  if (!actor?.email) return [];

  const email = normalizeEmail(actor.email);
  const rows = await db
    .select({
      id: teamInvitations.id,
      teamId: teamInvitations.teamId,
      role: teamInvitations.role,
      expiresAt: teamInvitations.expiresAt,
      createdAt: teamInvitations.createdAt,
      teamName: teams.name,
      inviterName: user.name,
    })
    .from(teamInvitations)
    .innerJoin(teams, eq(teamInvitations.teamId, teams.id))
    .leftJoin(user, eq(teamInvitations.invitedByUserId, user.id))
    .where(
      and(
        sql`lower(${teamInvitations.email}) = ${email}`,
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
        gt(teamInvitations.expiresAt, new Date()),
      ),
    );

  const result: MyPendingInvitationDto[] = [];
  for (const row of rows) {
    const teamRow = await db.query.teams.findFirst({
      where: eq(teams.id, row.teamId),
      columns: { defaultWorkspaceId: true },
    });
    const landingWs = await resolveTeamLandingWorkspace(
      row.teamId,
      teamRow?.defaultWorkspaceId,
    );
    result.push({
      id: row.id,
      teamId: row.teamId,
      teamName: row.teamName,
      workspaceId: landingWs?.id ?? null,
      workspaceName: row.teamName,
      role: row.role as WorkspaceRole,
      inviterName: row.inviterName,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: (row.createdAt ?? new Date()).toISOString(),
    });
  }
  return result;
}

async function acceptInviteRecord(
  actorUserId: string,
  invite: {
    id: string;
    teamId: string;
    email: string;
    role: string;
    acceptedAt: Date | null;
  },
): Promise<{ workspaceId: string; teamId: string }> {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, invite.teamId),
  });
  if (!team) {
    throw new TeamServiceError(410, "This invitation is no longer valid.");
  }

  const actor = await db.query.user.findFirst({
    where: eq(user.id, actorUserId),
    columns: { id: true, email: true, name: true },
  });
  if (!actor?.email) {
    throw new TeamServiceError(401, "Unauthorized");
  }

  if (normalizeEmail(actor.email) !== normalizeEmail(invite.email)) {
    throw new TeamServiceError(
      403,
      `Sign in as ${invite.email} to accept this invitation.`,
    );
  }

  const existing = await db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, invite.teamId),
      eq(teamMembers.userId, actorUserId),
    ),
    columns: { id: true },
  });

  const landingWs = await resolveTeamLandingWorkspace(
    invite.teamId,
    team.defaultWorkspaceId,
  );
  if (!landingWs) {
    throw new TeamServiceError(410, "This invitation is no longer valid.");
  }

  if (invite.acceptedAt || existing) {
    if (!existing) {
      throw new TeamServiceError(
        409,
        "This invitation has already been accepted.",
      );
    }
    await setActiveWorkspace(actorUserId, landingWs.id);
    return { workspaceId: landingWs.id, teamId: invite.teamId };
  }

  const teamsEnabled = getPlanLimits(
    (await getSubscriptionForUser(team.ownerUserId)).tier,
  ).allowTeams;
  if (!teamsEnabled) {
    throw new TeamServiceError(
      403,
      "This workspace’s Pro subscription is inactive. Teams invites can’t be accepted right now.",
    );
  }

  await db
    .insert(teamMembers)
    .values({
      teamId: invite.teamId,
      userId: actorUserId,
      role: invite.role as WorkspaceRole,
    })
    .onConflictDoNothing();

  await db
    .update(teamInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(teamInvitations.id, invite.id));

  await setActiveWorkspace(actorUserId, landingWs.id);

  const owner = await db.query.user.findFirst({
    where: eq(user.id, team.ownerUserId),
    columns: { email: true },
  });
  if (owner?.email) {
    try {
      await sendWorkspaceInviteAcceptedEmail({
        to: owner.email,
        workspaceName: team.name,
        memberName: actor.name ?? actor.email,
        memberEmail: actor.email,
      });
    } catch {
      // non-blocking
    }
  }

  await invalidateTeamMembersCache(invite.teamId);
  return { workspaceId: landingWs.id, teamId: invite.teamId };
}

/** Prefer the team's default workspace; fall back to oldest workspace. */
async function resolveTeamLandingWorkspace(
  teamId: string,
  defaultWorkspaceId: string | null | undefined,
): Promise<{ id: string } | null> {
  if (defaultWorkspaceId) {
    const preferred = await db.query.workspaces.findFirst({
      where: and(
        eq(workspaces.id, defaultWorkspaceId),
        eq(workspaces.teamId, teamId),
      ),
      columns: { id: true },
    });
    if (preferred) return preferred;
  }
  return (
    (await db.query.workspaces.findFirst({
      where: eq(workspaces.teamId, teamId),
      columns: { id: true },
      orderBy: [asc(workspaces.createdAt)],
    })) ?? null
  );
}

export async function acceptInvite(
  actorUserId: string,
  token: string,
): Promise<{ workspaceId: string; teamId: string }> {
  if (!token?.trim()) {
    throw new TeamServiceError(400, "Invitation token is required.");
  }

  const invite = await db.query.teamInvitations.findFirst({
    where: eq(teamInvitations.token, token.trim()),
  });

  if (!invite || invite.revokedAt) {
    throw new TeamServiceError(410, "This invitation is no longer valid.");
  }
  if (invite.expiresAt.getTime() < Date.now() && !invite.acceptedAt) {
    throw new TeamServiceError(410, "This invitation has expired.");
  }

  return acceptInviteRecord(actorUserId, invite);
}

export async function acceptMyInvitation(
  actorUserId: string,
  invitationId: string,
): Promise<{ workspaceId: string; teamId: string }> {
  if (!invitationId?.trim()) {
    throw new TeamServiceError(400, "Invitation id is required.");
  }

  const invite = await db.query.teamInvitations.findFirst({
    where: eq(teamInvitations.id, invitationId.trim()),
  });

  if (!invite || invite.revokedAt) {
    throw new TeamServiceError(410, "This invitation is no longer valid.");
  }
  if (invite.expiresAt.getTime() < Date.now() && !invite.acceptedAt) {
    throw new TeamServiceError(410, "This invitation has expired.");
  }

  return acceptInviteRecord(actorUserId, invite);
}

export async function declineMyInvitation(
  actorUserId: string,
  invitationId: string,
): Promise<void> {
  if (!invitationId?.trim()) {
    throw new TeamServiceError(400, "Invitation id is required.");
  }

  const actor = await db.query.user.findFirst({
    where: eq(user.id, actorUserId),
    columns: { email: true },
  });
  if (!actor?.email) {
    throw new TeamServiceError(401, "Unauthorized");
  }

  const invite = await db.query.teamInvitations.findFirst({
    where: eq(teamInvitations.id, invitationId.trim()),
  });
  if (!invite || invite.revokedAt || invite.acceptedAt) {
    throw new TeamServiceError(410, "This invitation is no longer valid.");
  }
  if (normalizeEmail(actor.email) !== normalizeEmail(invite.email)) {
    throw new TeamServiceError(403, "This invitation is for a different email.");
  }

  await db
    .update(teamInvitations)
    .set({ revokedAt: new Date() })
    .where(eq(teamInvitations.id, invite.id));
}

export async function updateMemberRole(
  actorUserId: string,
  memberId: string,
  roleRaw: unknown,
): Promise<void> {
  if (!isWorkspaceRole(roleRaw)) {
    throw new TeamServiceError(
      400,
      "Invalid role. Use admin, member, community, or analyst.",
    );
  }

  const member = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.id, memberId),
  });
  if (!member) {
    throw new TeamServiceError(404, "Member not found");
  }

  const team = await requireTeamAdminPermission(
    actorUserId,
    member.teamId,
    "change_roles",
  );
  if (member.userId === team.ownerUserId) {
    throw new TeamServiceError(400, "Cannot change the owner's role.");
  }

  await db
    .update(teamMembers)
    .set({ role: roleRaw, updatedAt: new Date() })
    .where(eq(teamMembers.id, memberId));

  await invalidateTeamMembersCache(member.teamId);

  const memberUser = await db.query.user.findFirst({
    where: eq(user.id, member.userId),
    columns: { email: true },
  });
  if (memberUser?.email) {
    try {
      await sendWorkspaceRoleChangedEmail({
        to: memberUser.email,
        workspaceName: team.teamName,
        role: workspaceRoleLabel(roleRaw),
      });
    } catch {
      // non-blocking
    }
  }
}

export async function removeMember(
  actorUserId: string,
  memberId: string,
): Promise<void> {
  const member = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.id, memberId),
  });
  if (!member) {
    throw new TeamServiceError(404, "Member not found");
  }

  const team = await requireTeamAdminPermission(
    actorUserId,
    member.teamId,
    "remove_users",
  );
  if (member.userId === team.ownerUserId) {
    throw new TeamServiceError(400, "Cannot remove the team owner.");
  }

  const memberUser = await db.query.user.findFirst({
    where: eq(user.id, member.userId),
    columns: { email: true },
  });

  await db.delete(teamMembers).where(eq(teamMembers.id, memberId));

  await invalidateTeamMembersCache(member.teamId);

  const teamWorkspaceIds = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.teamId, team.teamId));
  const ids = teamWorkspaceIds.map((w) => w.id);
  if (ids.length > 0) {
    await db
      .update(userSettings)
      .set({ activeWorkspaceId: null })
      .where(
        and(
          eq(userSettings.userId, member.userId),
          inArray(userSettings.activeWorkspaceId, ids),
        ),
      );
  }

  if (memberUser?.email) {
    try {
      await sendWorkspaceMemberRemovedEmail({
        to: memberUser.email,
        workspaceName: team.teamName,
      });
    } catch {
      // non-blocking
    }
  }
}

export async function revokeInvitation(
  actorUserId: string,
  invitationId: string,
): Promise<void> {
  const invite = await db.query.teamInvitations.findFirst({
    where: eq(teamInvitations.id, invitationId),
  });
  if (!invite) {
    throw new TeamServiceError(404, "Invitation not found");
  }

  await requireTeamAdminPermission(
    actorUserId,
    invite.teamId,
    "invite_users",
  );

  if (invite.acceptedAt) {
    throw new TeamServiceError(409, "Invitation already accepted");
  }

  await db
    .update(teamInvitations)
    .set({ revokedAt: new Date() })
    .where(eq(teamInvitations.id, invitationId));
}

export async function getTeamContextForUser(actorUserId: string) {
  const ctx = await resolveWorkspaceContext(actorUserId);
  return {
    role: ctx.role,
    permissions: ctx.inWorkspace ? ctx.permissionsDto : null,
    resourceOwnerId: ctx.resourceUserId,
    teamsEnabled: ctx.teamsEnabled,
    workspaceId: ctx.workspaceId,
    teamId: ctx.teamId,
    isOwner: ctx.isOwner,
  };
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
  ownerUserId: string;
  defaultWorkspaceId: string | null;
  /** False = solo workspace container; omit from /teams and team cap. */
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

export async function listWorkspacesForUser(
  actorUserId: string,
): Promise<{
  workspaces: WorkspaceListItem[];
  teams: TeamListItem[];
  canCreate: boolean;
  canCreateTeam: boolean;
  ownedTeamCount: number;
  maxOwnedTeams: number;
}> {
  const [sub, ctx, ownedCountRow, personalCountRow, memberships] =
    await Promise.all([
      getSubscriptionForUser(actorUserId),
      resolveWorkspaceContext(actorUserId),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(teams)
        .where(
          and(
            eq(teams.ownerUserId, actorUserId),
            eq(teams.isCollaborative, true),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.userId, actorUserId),
            isNull(connectedAccounts.workspaceId),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({
          teamId: teamMembers.teamId,
          role: teamMembers.role,
          ownerUserId: teams.ownerUserId,
          teamName: teams.name,
          defaultWorkspaceId: teams.defaultWorkspaceId,
          isCollaborative: teams.isCollaborative,
        })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(eq(teamMembers.userId, actorUserId)),
    ]);

  const limits = getPlanLimits(sub.tier);
  const ownedCount = ownedCountRow?.count ?? 0;
  const underTeamCap = ownedCount < MAX_OWNED_TEAMS;

  const canCreate = limits.allowMultiWorkspace;
  const canCreateTeam = limits.allowTeams && underTeamCap;

  const workspaceItems: WorkspaceListItem[] = [
    {
      id: null,
      name: "Main",
      kind: "personal",
      teamId: null,
      teamName: null,
      role: null,
      isOwner: true,
      isActive: !ctx.workspaceId,
      connectionCount: personalCountRow?.count ?? 0,
      memberCount: 1,
      icon: "house",
    },
  ];

  const teamItems: TeamListItem[] = [];
  const teamIds = memberships.map((m) => m.teamId);

  if (teamIds.length > 0) {
    const [memberCountRows, wsRows] = await Promise.all([
      db
        .select({
          teamId: teamMembers.teamId,
          count: sql<number>`count(*)::int`,
        })
        .from(teamMembers)
        .where(inArray(teamMembers.teamId, teamIds))
        .groupBy(teamMembers.teamId),
      db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          teamId: workspaces.teamId,
          icon: workspaces.icon,
        })
        .from(workspaces)
        .where(inArray(workspaces.teamId, teamIds)),
    ]);

    const memberCountByTeam = new Map(
      memberCountRows.map((r) => [r.teamId, r.count ?? 0]),
    );

    const wsIds = wsRows.map((w) => w.id);
    const connectionCountByWs = new Map<string, number>();
    if (wsIds.length > 0) {
      const connRows = await db
        .select({
          workspaceId: connectedAccounts.workspaceId,
          count: sql<number>`count(*)::int`,
        })
        .from(connectedAccounts)
        .where(inArray(connectedAccounts.workspaceId, wsIds))
        .groupBy(connectedAccounts.workspaceId);
      for (const row of connRows) {
        if (row.workspaceId) {
          connectionCountByWs.set(row.workspaceId, row.count ?? 0);
        }
      }
    }

    const workspacesByTeam = new Map<
      string,
      {
        id: string;
        name: string;
        connectionCount: number;
        isActive: boolean;
        icon: string;
      }[]
    >();
    for (const ws of wsRows) {
      if (!ws.teamId) continue;
      const list = workspacesByTeam.get(ws.teamId) ?? [];
      list.push({
        id: ws.id,
        name: ws.name,
        connectionCount: connectionCountByWs.get(ws.id) ?? 0,
        isActive: ctx.workspaceId === ws.id,
        icon: normalizeWorkspaceIcon(ws.icon),
      });
      workspacesByTeam.set(ws.teamId, list);
    }

    for (const m of memberships) {
      const isOwner = m.ownerUserId === actorUserId;
      const memberCount = memberCountByTeam.get(m.teamId) ?? 0;
      const teamWorkspaces = (workspacesByTeam.get(m.teamId) ?? []).sort(
        (a, b) => a.name.localeCompare(b.name),
      );

      for (const ws of teamWorkspaces) {
        workspaceItems.push({
          id: ws.id,
          name: ws.name,
          kind: isOwner ? "owned" : "joined",
          teamId: m.teamId,
          teamName: m.isCollaborative ? m.teamName : null,
          role: m.role as WorkspaceRole,
          isOwner,
          isActive: ws.isActive,
          connectionCount: ws.connectionCount,
          memberCount,
          icon: ws.icon,
        });
      }

      teamItems.push({
        id: m.teamId,
        name: m.teamName,
        kind: isOwner ? "owned" : "joined",
        role: m.role as WorkspaceRole,
        isOwner,
        ownerUserId: m.ownerUserId,
        defaultWorkspaceId:
          m.defaultWorkspaceId ?? teamWorkspaces[0]?.id ?? null,
        isCollaborative: m.isCollaborative,
        memberCount,
        workspaces: teamWorkspaces,
      });
    }
  }

  workspaceItems.sort((a, b) => {
    if (a.kind === "personal") return -1;
    if (b.kind === "personal") return 1;
    if (a.kind !== b.kind) return a.kind === "owned" ? -1 : 1;
    const teamCmp = (a.teamName ?? "").localeCompare(b.teamName ?? "");
    if (teamCmp !== 0) return teamCmp;
    return a.name.localeCompare(b.name);
  });

  teamItems.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "owned" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    workspaces: workspaceItems,
    teams: teamItems,
    canCreate,
    canCreateTeam,
    ownedTeamCount: ownedCount,
    maxOwnedTeams: MAX_OWNED_TEAMS,
  };
}

/** Create a team (+ first workspace). Collaborative teams require Pro (max 5). */
export async function createTeamForUser(
  actorUserId: string,
  nameRaw: unknown,
  workspaceNameRaw?: unknown,
  opts?: { isCollaborative?: boolean; icon?: unknown },
): Promise<{ teamId: string; workspaceId: string }> {
  const isCollaborative = opts?.isCollaborative !== false;
  const icon = normalizeWorkspaceIcon(opts?.icon);
  const sub = await getSubscriptionForUser(actorUserId);
  const limits = getPlanLimits(sub.tier);

  if (isCollaborative) {
    if (!limits.allowTeams) {
      throw new TeamServiceError(
        403,
        "Creating teams requires the Pro plan.",
      );
    }
  } else if (!limits.allowMultiWorkspace) {
    throw new TeamServiceError(
      403,
      "Creating workspaces requires a paid plan.",
    );
  }

  const teamName =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim().slice(0, 80)
      : "";
  if (!teamName) {
    throw new TeamServiceError(
      400,
      isCollaborative ? "A team name is required." : "A workspace name is required.",
    );
  }

  const workspaceName =
    typeof workspaceNameRaw === "string" && workspaceNameRaw.trim()
      ? workspaceNameRaw.trim().slice(0, 80)
      : isCollaborative
        ? defaultWorkspaceNameForTeam(teamName)
        : teamName;

  if (isCollaborative) {
    const [ownedCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(teams)
      .where(
        and(
          eq(teams.ownerUserId, actorUserId),
          eq(teams.isCollaborative, true),
        ),
      );
    if ((ownedCountRow?.count ?? 0) >= MAX_OWNED_TEAMS) {
      throw new TeamServiceError(
        403,
        `You can create up to ${MAX_OWNED_TEAMS} teams.`,
      );
    }
  }

  const [createdTeam] = await db
    .insert(teams)
    .values({
      name: teamName,
      ownerUserId: actorUserId,
      isCollaborative,
    })
    .returning({ id: teams.id });

  await db.insert(teamMembers).values({
    teamId: createdTeam.id,
    userId: actorUserId,
    role: "admin",
  });

  const [createdWs] = await db
    .insert(workspaces)
    .values({ name: workspaceName, teamId: createdTeam.id, icon })
    .returning({ id: workspaces.id });

  await db
    .update(teams)
    .set({ defaultWorkspaceId: createdWs.id, updatedAt: new Date() })
    .where(eq(teams.id, createdTeam.id));

  await setActiveWorkspace(actorUserId, createdWs.id);
  await setCachedTeamMeta({
    id: createdTeam.id,
    name: teamName,
    ownerUserId: actorUserId,
    defaultWorkspaceId: createdWs.id,
    isCollaborative,
  });
  await setCachedWorkspaceMeta({
    id: createdWs.id,
    name: workspaceName,
    teamId: createdTeam.id,
    icon,
  });
  await setCachedTeamWorkspaces(createdTeam.id, [
    { id: createdWs.id, name: workspaceName, connectionCount: 0, icon },
  ]);
  return { teamId: createdTeam.id, workspaceId: createdWs.id };
}

export async function createWorkspaceInTeam(
  actorUserId: string,
  teamId: string,
  nameRaw: unknown,
  iconRaw?: unknown,
): Promise<{ workspaceId: string }> {
  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim().slice(0, 80)
      : "";
  if (!name) {
    throw new TeamServiceError(400, "A workspace name is required.");
  }
  const icon = normalizeWorkspaceIcon(iconRaw);

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { id: true, ownerUserId: true, defaultWorkspaceId: true },
  });
  if (!team) {
    throw new TeamServiceError(404, "Team not found.");
  }
  if (team.ownerUserId !== actorUserId) {
    throw new TeamServiceError(
      403,
      "Only the team owner can add workspaces.",
    );
  }

  const teamsEnabled = getPlanLimits(
    (await getSubscriptionForUser(actorUserId)).tier,
  ).allowTeams;
  if (!teamsEnabled) {
    throw new TeamServiceError(403, "Creating workspaces requires Pro.");
  }

  const [created] = await db
    .insert(workspaces)
    .values({ name, teamId: team.id, icon })
    .returning({ id: workspaces.id });

  if (!team.defaultWorkspaceId) {
    await db
      .update(teams)
      .set({ defaultWorkspaceId: created.id, updatedAt: new Date() })
      .where(eq(teams.id, team.id));
    const meta = await getCachedTeamMeta(team.id);
    if (meta) {
      await setCachedTeamMeta({
        ...meta,
        defaultWorkspaceId: created.id,
      });
    }
  }

  await setCachedWorkspaceMeta({
    id: created.id,
    name,
    teamId: team.id,
    icon,
  });
  await invalidateTeamWorkspacesCache(team.id);
  await setActiveWorkspace(actorUserId, created.id);
  return { workspaceId: created.id };
}

export async function renameTeamForUser(
  actorUserId: string,
  teamId: string,
  nameRaw: unknown,
): Promise<{ name: string }> {
  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim().slice(0, 80)
      : "";
  if (!name) {
    throw new TeamServiceError(400, "A team name is required.");
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { id: true, ownerUserId: true },
  });
  if (!team) {
    throw new TeamServiceError(404, "Team not found.");
  }
  if (team.ownerUserId !== actorUserId) {
    throw new TeamServiceError(403, "Only the owner can rename this team.");
  }

  await db.update(teams).set({ name, updatedAt: new Date() }).where(eq(teams.id, teamId));

  const existing = await getCachedTeamMeta(teamId);
  if (existing) {
    await setCachedTeamMeta({ ...existing, name });
  } else {
    await loadTeamMeta(teamId);
  }

  return { name };
}

export async function renameWorkspaceForUser(
  actorUserId: string,
  workspaceId: string,
  nameRaw: unknown,
): Promise<{ name: string }> {
  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim().slice(0, 80)
      : "";
  if (!name) {
    throw new TeamServiceError(400, "A workspace name is required.");
  }

  const [row] = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      teamId: workspaces.teamId,
      icon: workspaces.icon,
      ownerUserId: teams.ownerUserId,
    })
    .from(workspaces)
    .innerJoin(teams, eq(workspaces.teamId, teams.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!row) {
    throw new TeamServiceError(404, "Workspace not found.");
  }
  if (row.ownerUserId !== actorUserId) {
    throw new TeamServiceError(
      403,
      "Only the team owner can rename workspaces.",
    );
  }

  await db
    .update(workspaces)
    .set({ name, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  await setCachedWorkspaceMeta({
    id: workspaceId,
    name,
    teamId: row.teamId,
    icon: normalizeWorkspaceIcon(row.icon),
  });
  await invalidateTeamWorkspacesCache(row.teamId);

  return { name };
}

export async function deleteWorkspaceInTeam(
  actorUserId: string,
  workspaceId: string,
): Promise<{ moved: number; skipped: number }> {
  const [row] = await db
    .select({
      workspaceId: workspaces.id,
      teamId: workspaces.teamId,
      ownerUserId: teams.ownerUserId,
      defaultWorkspaceId: teams.defaultWorkspaceId,
      isCollaborative: teams.isCollaborative,
    })
    .from(workspaces)
    .innerJoin(teams, eq(workspaces.teamId, teams.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!row) {
    throw new TeamServiceError(404, "Workspace not found.");
  }
  if (row.ownerUserId !== actorUserId) {
    throw new TeamServiceError(
      403,
      "Only the team owner can delete workspaces.",
    );
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaces)
    .where(eq(workspaces.teamId, row.teamId));
  const workspaceCount = countRow?.count ?? 0;

  // Solo workspace container → remove the container team; connections → Main.
  if (!row.isCollaborative) {
    return deleteTeamForUser(actorUserId, row.teamId, {
      keepConnections: true,
    });
  }

  if (workspaceCount <= 1) {
    throw new TeamServiceError(
      400,
      "You can't delete a team's only workspace. Delete the team from Teams instead.",
    );
  }

  if (!row.defaultWorkspaceId || row.defaultWorkspaceId === workspaceId) {
    throw new TeamServiceError(
      400,
      "You can't delete the team's default workspace. Delete other workspaces first, or delete the whole team from Teams.",
    );
  }

  await db
    .update(userSettings)
    .set({ activeWorkspaceId: null })
    .where(eq(userSettings.activeWorkspaceId, workspaceId));

  const result = await moveConnectionsBetweenWorkspaces(
    workspaceId,
    row.defaultWorkspaceId,
  );

  // Keep posts with the accounts — don't let ON DELETE SET NULL dump them into Main.
  await db
    .update(posts)
    .set({ workspaceId: row.defaultWorkspaceId, updatedAt: new Date() })
    .where(eq(posts.workspaceId, workspaceId));

  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await invalidateTeamRoomCache(row.teamId, [workspaceId]);
  return result;
}

/**
 * Move connections from one workspace to another.
 * Duplicates already on the target (same platform + platform_user_id) are dropped.
 */
async function moveConnectionsBetweenWorkspaces(
  fromWorkspaceId: string,
  toWorkspaceId: string,
): Promise<{ moved: number; skipped: number }> {
  const source = await db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.workspaceId, fromWorkspaceId));

  if (source.length === 0) return { moved: 0, skipped: 0 };

  const target = await db
    .select({
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.workspaceId, toWorkspaceId));

  const targetKeys = new Set(
    target.map((t) => `${t.platform}:${t.platformUserId}`),
  );

  const toSkip: string[] = [];
  const toMove: string[] = [];
  for (const acc of source) {
    const key = `${acc.platform}:${acc.platformUserId}`;
    if (targetKeys.has(key)) toSkip.push(acc.id);
    else toMove.push(acc.id);
  }

  if (toSkip.length > 0) {
    await db
      .delete(connectedAccounts)
      .where(inArray(connectedAccounts.id, toSkip));
  }
  if (toMove.length > 0) {
    await db
      .update(connectedAccounts)
      .set({ workspaceId: toWorkspaceId, updatedAt: new Date() })
      .where(inArray(connectedAccounts.id, toMove));
  }

  return { moved: toMove.length, skipped: toSkip.length };
}

/**
 * Move connections from workspaces onto personal Main (workspace_id null).
 * Duplicates already on Main for that user are dropped.
 */
async function moveConnectionsToPersonal(
  workspaceIds: string[],
): Promise<{ moved: number; skipped: number }> {
  if (workspaceIds.length === 0) return { moved: 0, skipped: 0 };

  const source = await db
    .select({
      id: connectedAccounts.id,
      userId: connectedAccounts.userId,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
    })
    .from(connectedAccounts)
    .where(inArray(connectedAccounts.workspaceId, workspaceIds));

  if (source.length === 0) return { moved: 0, skipped: 0 };

  const userIds = [...new Set(source.map((s) => s.userId))];
  const personal = await db
    .select({
      userId: connectedAccounts.userId,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
    })
    .from(connectedAccounts)
    .where(
      and(
        inArray(connectedAccounts.userId, userIds),
        isNull(connectedAccounts.workspaceId),
      ),
    );

  const personalKeys = new Set(
    personal.map((p) => `${p.userId}:${p.platform}:${p.platformUserId}`),
  );

  const toSkip: string[] = [];
  const toMove: string[] = [];
  for (const acc of source) {
    const key = `${acc.userId}:${acc.platform}:${acc.platformUserId}`;
    if (personalKeys.has(key)) toSkip.push(acc.id);
    else toMove.push(acc.id);
  }

  if (toSkip.length > 0) {
    await db
      .delete(connectedAccounts)
      .where(inArray(connectedAccounts.id, toSkip));
  }
  if (toMove.length > 0) {
    await db
      .update(connectedAccounts)
      .set({ workspaceId: null, updatedAt: new Date() })
      .where(inArray(connectedAccounts.id, toMove));
  }

  return { moved: toMove.length, skipped: toSkip.length };
}

export async function deleteTeamForUser(
  actorUserId: string,
  teamId: string,
  opts?: { keepConnections?: boolean },
): Promise<{ moved: number; skipped: number }> {
  const keepConnections = opts?.keepConnections === true;

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { id: true, ownerUserId: true },
  });
  if (!team) {
    throw new TeamServiceError(404, "Team not found.");
  }
  if (team.ownerUserId !== actorUserId) {
    throw new TeamServiceError(403, "Only the owner can delete this team.");
  }

  const wsRows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.teamId, teamId));
  const wsIds = wsRows.map((w) => w.id);

  let result = { moved: 0, skipped: 0 };
  if (wsIds.length > 0) {
    await db
      .update(userSettings)
      .set({ activeWorkspaceId: null })
      .where(inArray(userSettings.activeWorkspaceId, wsIds));

    if (keepConnections) {
      result = await moveConnectionsToPersonal(wsIds);
      // Match connections → Main so SET NULL on workspace delete doesn't surprise.
      await db
        .update(posts)
        .set({ workspaceId: null, updatedAt: new Date() })
        .where(inArray(posts.workspaceId, wsIds));
    } else {
      await db
        .delete(connectedAccounts)
        .where(inArray(connectedAccounts.workspaceId, wsIds));
      const postRows = await db
        .select({ id: posts.id })
        .from(posts)
        .where(inArray(posts.workspaceId, wsIds));
      const postIds = postRows.map((p) => p.id);
      if (postIds.length > 0) {
        await db
          .delete(postPublications)
          .where(inArray(postPublications.postId, postIds));
        await db.delete(posts).where(inArray(posts.id, postIds));
      }
    }
  }

  await db.delete(teams).where(eq(teams.id, teamId));
  await invalidateTeamRoomCache(teamId, wsIds);
  return result;
}

export async function switchWorkspaceForUser(
  actorUserId: string,
  workspaceIdRaw: unknown,
): Promise<{ workspaceId: string | null }> {
  const workspaceId =
    workspaceIdRaw === null || workspaceIdRaw === undefined
      ? null
      : typeof workspaceIdRaw === "string"
        ? workspaceIdRaw
        : null;

  if (workspaceIdRaw !== null && workspaceIdRaw !== undefined && !workspaceId) {
    throw new TeamServiceError(400, "Invalid workspace id.");
  }

  const ctx = await setActiveWorkspace(actorUserId, workspaceId);
  return { workspaceId: ctx.workspaceId };
}

export async function leaveTeamForUser(
  actorUserId: string,
  teamId: string,
): Promise<void> {
  if (!teamId?.trim()) {
    throw new TeamServiceError(400, "Team id is required.");
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { id: true, ownerUserId: true },
  });
  if (!team) {
    throw new TeamServiceError(404, "Team not found.");
  }
  if (team.ownerUserId === actorUserId) {
    throw new TeamServiceError(
      400,
      "Owners can’t leave their team. Remove members or delete it instead.",
    );
  }

  const membership = await db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, teamId),
      eq(teamMembers.userId, actorUserId),
    ),
    columns: { id: true },
  });
  if (!membership) {
    throw new TeamServiceError(404, "You are not a member of this team.");
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, membership.id));

  const wsRows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.teamId, teamId));
  const ids = wsRows.map((w) => w.id);
  if (ids.length > 0) {
    await db
      .update(userSettings)
      .set({ activeWorkspaceId: null })
      .where(
        and(
          eq(userSettings.userId, actorUserId),
          inArray(userSettings.activeWorkspaceId, ids),
        ),
      );
  }

  await invalidateTeamMembersCache(teamId);
}

/** @deprecated use leaveTeamForUser */
export async function leaveWorkspaceForUser(
  actorUserId: string,
  workspaceId: string,
): Promise<void> {
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { teamId: true },
  });
  if (!ws) {
    throw new TeamServiceError(404, "Workspace not found.");
  }
  await leaveTeamForUser(actorUserId, ws.teamId);
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
  /** Account owner for connections in this card (personal = viewer, team = team owner). */
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

async function loadAccountsForScope(opts: {
  ownerUserId: string;
  workspaceId: string | null;
}): Promise<WorkspaceBoardAccount[]> {
  const rows = await db.query.connectedAccounts.findMany({
    where:
      opts.workspaceId === null
        ? and(
            eq(connectedAccounts.userId, opts.ownerUserId),
            isNull(connectedAccounts.workspaceId),
          )
        : and(
            eq(connectedAccounts.userId, opts.ownerUserId),
            eq(connectedAccounts.workspaceId, opts.workspaceId),
          ),
    columns: {
      id: true,
      platform: true,
      platformUsername: true,
      profileImageUrl: true,
      isActive: true,
    },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    platformUsername: r.platformUsername,
    profileImageUrl: r.profileImageUrl,
    isActive: r.isActive,
  }));
}

/** Card board for /dashboard/workspaces: every accessible workspace + its connections. */
export async function listWorkspaceBoardForUser(
  actorUserId: string,
): Promise<WorkspaceBoardResponse> {
  const list = await listWorkspacesForUser(actorUserId);
  const ctx = await resolveWorkspaceContext(actorUserId);

  const cards: WorkspaceBoardCard[] = [];

  const personal = list.workspaces.find((w) => w.kind === "personal");
  const personalAccounts = await loadAccountsForScope({
    ownerUserId: actorUserId,
    workspaceId: null,
  });
  cards.push({
    id: null,
    name: personal?.name ?? "Main",
    kind: "personal",
    teamId: null,
    teamName: null,
    ownerUserId: actorUserId,
    isOwner: true,
    canManage: true,
    canRename: false,
    canDelete: false,
    isActive: !ctx.workspaceId,
    connectionCount: personalAccounts.length,
    accounts: personalAccounts,
    icon: "house",
  });

  const uniqueOwnerIds = [
    ...new Set(list.teams.map((t) => t.ownerUserId)),
  ];
  const ownerTeamsEnabledById = new Map<string, boolean>();
  await Promise.all(
    uniqueOwnerIds.map(async (ownerId) => {
      const sub = await getSubscriptionForUser(ownerId);
      ownerTeamsEnabledById.set(
        ownerId,
        getPlanLimits(sub.tier).allowTeams,
      );
    }),
  );

  for (const team of list.teams) {
    const ownerTeamsEnabled =
      ownerTeamsEnabledById.get(team.ownerUserId) ?? false;
    const canManage =
      team.isOwner ||
      permissionsForRole(team.role, {
        isOwner: team.isOwner,
        teamsEnabled: ownerTeamsEnabled,
        inWorkspace: true,
      }).has("manage_connections");
    const canRename = team.isOwner;

    for (const ws of team.workspaces) {
      const accounts = await loadAccountsForScope({
        ownerUserId: team.ownerUserId,
        workspaceId: ws.id,
      });
      // Main is never listed here. Solo workspace containers can be deleted.
      // Collaborative teams: only non-default workspaces (need ≥2). Deleting
      // the default / last workspace would wipe the team — do that from Teams.
      const canDelete =
        team.isOwner &&
        (!team.isCollaborative ||
          (team.workspaces.length > 1 &&
            ws.id !== team.defaultWorkspaceId));

      cards.push({
        id: ws.id,
        name: ws.name,
        kind: team.kind,
        teamId: team.id,
        teamName: team.isCollaborative ? team.name : null,
        ownerUserId: team.ownerUserId,
        isOwner: team.isOwner,
        canManage,
        canRename,
        canDelete,
        isActive: ws.isActive,
        connectionCount: accounts.length,
        accounts,
        icon: ws.icon,
      });
    }
  }

  return {
    cards,
    canCreate: list.canCreate,
    canCreateTeam: list.canCreateTeam,
    ownedTeamCount: list.ownedTeamCount,
    maxOwnedTeams: list.maxOwnedTeams,
  };
}

async function assertCanManageAccount(
  actorUserId: string,
  account: { id: string; userId: string; workspaceId: string | null },
): Promise<void> {
  if (account.userId === actorUserId) {
    if (!account.workspaceId) return;
    const [row] = await db
      .select({ ownerUserId: teams.ownerUserId, role: teamMembers.role })
      .from(workspaces)
      .innerJoin(teams, eq(workspaces.teamId, teams.id))
      .innerJoin(
        teamMembers,
        and(
          eq(teamMembers.teamId, teams.id),
          eq(teamMembers.userId, actorUserId),
        ),
      )
      .where(eq(workspaces.id, account.workspaceId))
      .limit(1);
    if (!row) {
      throw new TeamServiceError(403, "Forbidden");
    }
    const isOwner = row.ownerUserId === actorUserId;
    const teamsEnabled = getPlanLimits(
      (await getSubscriptionForUser(row.ownerUserId)).tier,
    ).allowTeams;
    const perms = permissionsForRole(row.role as WorkspaceRole, {
      isOwner,
      teamsEnabled,
      inWorkspace: true,
    });
    if (!perms.has("manage_connections")) {
      throw new TeamServiceError(403, "Forbidden");
    }
    return;
  }

  // Invitee managing owner's connection in a team workspace
  if (!account.workspaceId) {
    throw new TeamServiceError(403, "Forbidden");
  }
  const [row] = await db
    .select({ ownerUserId: teams.ownerUserId, role: teamMembers.role })
    .from(workspaces)
    .innerJoin(teams, eq(workspaces.teamId, teams.id))
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, teams.id),
        eq(teamMembers.userId, actorUserId),
      ),
    )
    .where(eq(workspaces.id, account.workspaceId))
    .limit(1);

  if (!row || row.ownerUserId !== account.userId) {
    throw new TeamServiceError(403, "Forbidden");
  }
  const isOwner = row.ownerUserId === actorUserId;
  const teamsEnabled = getPlanLimits(
    (await getSubscriptionForUser(row.ownerUserId)).tier,
  ).allowTeams;
  const perms = permissionsForRole(row.role as WorkspaceRole, {
    isOwner,
    teamsEnabled,
    inWorkspace: true,
  });
  if (!perms.has("manage_connections")) {
    throw new TeamServiceError(403, "Forbidden");
  }
}

async function assertActorCanManageWorkspace(
  actorUserId: string,
  workspaceId: string,
): Promise<{ ownerUserId: string; role: WorkspaceRole; isOwner: boolean }> {
  const [row] = await db
    .select({
      ownerUserId: teams.ownerUserId,
      role: teamMembers.role,
    })
    .from(workspaces)
    .innerJoin(teams, eq(workspaces.teamId, teams.id))
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, teams.id),
        eq(teamMembers.userId, actorUserId),
      ),
    )
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!row) {
    throw new TeamServiceError(404, "Target workspace not found.");
  }

  const isOwner = row.ownerUserId === actorUserId;
  if (isOwner) {
    return {
      ownerUserId: row.ownerUserId,
      role: row.role as WorkspaceRole,
      isOwner: true,
    };
  }

  const teamsEnabled = getPlanLimits(
    (await getSubscriptionForUser(row.ownerUserId)).tier,
  ).allowTeams;
  if (!teamsEnabled) {
    throw new TeamServiceError(
      403,
      "Teams is paused because the workspace Pro subscription is inactive.",
    );
  }
  const perms = permissionsForRole(row.role as WorkspaceRole, {
    isOwner: false,
    teamsEnabled,
    inWorkspace: true,
  });
  if (!perms.has("manage_connections")) {
    throw new TeamServiceError(403, "Forbidden");
  }
  return {
    ownerUserId: row.ownerUserId,
    role: row.role as WorkspaceRole,
    isOwner: false,
  };
}

/**
 * Resolve whether the actor may move `account` into `targetWorkspaceId`, and
 * which userId the connection should have after the move.
 *
 * - Main (null) on the board is always the actor's personal pool.
 * - Moving into a team workspace you admin → connection belongs to the team owner.
 * - Moving out of a team into your personal/owned workspace → connection belongs to you.
 * - Moving within the same owner's workspaces → ownership unchanged.
 */
async function resolveMoveTarget(
  actorUserId: string,
  account: { userId: string; workspaceId: string | null },
  targetWorkspaceId: string | null,
): Promise<{ nextUserId: string }> {
  if (targetWorkspaceId === null) {
    // Board "Main" = actor personal pool, and moving there transfers ownership
    // of the connection (tokens included). `manage_connections` is scoped to a
    // team's workspaces — it must not let a team Admin walk the owner's
    // connected account out of the team and into their own private pool. Only
    // the account's current owner may pull it back to Main.
    if (account.userId !== actorUserId) {
      throw new TeamServiceError(
        403,
        "Only the account owner can move this connection to Main.",
      );
    }
    return { nextUserId: actorUserId };
  }

  const target = await assertActorCanManageWorkspace(
    actorUserId,
    targetWorkspaceId,
  );

  // Into actor's own workspace (solo or owned team).
  if (target.isOwner) {
    return { nextUserId: actorUserId };
  }

  // Into a team the actor admins → team owner's pool.
  // Allowed when the connection is already the owner's, or the actor is
  // contributing their own personal connection.
  if (
    account.userId === target.ownerUserId ||
    account.userId === actorUserId
  ) {
    return { nextUserId: target.ownerUserId };
  }

  throw new TeamServiceError(
    403,
    "Connections can only move into workspaces you can manage for that account owner.",
  );
}

/** Move a connected account between Main and team workspaces. */
export async function moveConnectedAccountToWorkspace(
  actorUserId: string,
  accountId: string,
  targetWorkspaceIdRaw: unknown,
): Promise<{ workspaceId: string | null }> {
  if (!accountId?.trim()) {
    throw new TeamServiceError(400, "Account id is required.");
  }

  const targetWorkspaceId =
    targetWorkspaceIdRaw === null || targetWorkspaceIdRaw === undefined
      ? null
      : typeof targetWorkspaceIdRaw === "string" && targetWorkspaceIdRaw.trim()
        ? targetWorkspaceIdRaw.trim()
        : undefined;

  if (targetWorkspaceId === undefined) {
    throw new TeamServiceError(400, "workspaceId must be a string or null.");
  }

  const account = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.id, accountId.trim()),
    columns: {
      id: true,
      userId: true,
      workspaceId: true,
      platform: true,
      platformUserId: true,
    },
  });
  if (!account) {
    throw new TeamServiceError(404, "Account not found.");
  }

  const currentId = account.workspaceId ?? null;
  if (currentId === targetWorkspaceId) {
    return { workspaceId: currentId };
  }

  await assertCanManageAccount(actorUserId, account);
  const { nextUserId } = await resolveMoveTarget(
    actorUserId,
    account,
    targetWorkspaceId,
  );

  if (nextUserId !== account.userId) {
    const duplicate = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, nextUserId),
        eq(connectedAccounts.platform, account.platform),
        eq(connectedAccounts.platformUserId, account.platformUserId),
      ),
      columns: { id: true },
    });
    if (duplicate) {
      throw new TeamServiceError(
        409,
        "That account is already connected for the destination owner.",
      );
    }
  }

  // Same platform account already lives in the destination workspace
  // (Main or a team workspace) — unique on (workspace_id, platform, platform_user_id).
  const alreadyInDestination =
    targetWorkspaceId === null
      ? await db.query.connectedAccounts.findFirst({
          where: and(
            eq(connectedAccounts.userId, nextUserId),
            eq(connectedAccounts.platform, account.platform),
            eq(connectedAccounts.platformUserId, account.platformUserId),
            isNull(connectedAccounts.workspaceId),
            ne(connectedAccounts.id, account.id),
          ),
          columns: { id: true },
        })
      : await db.query.connectedAccounts.findFirst({
          where: and(
            eq(connectedAccounts.workspaceId, targetWorkspaceId),
            eq(connectedAccounts.platform, account.platform),
            eq(connectedAccounts.platformUserId, account.platformUserId),
            ne(connectedAccounts.id, account.id),
          ),
          columns: { id: true },
        });
  if (alreadyInDestination) {
    throw new TeamServiceError(
      409,
      "That account is already in the destination workspace.",
    );
  }

  try {
    await db
      .update(connectedAccounts)
      .set({
        workspaceId: targetWorkspaceId,
        userId: nextUserId,
        updatedAt: new Date(),
      })
      .where(eq(connectedAccounts.id, account.id));
  } catch (err) {
    const pgCode =
      err && typeof err === "object" && "cause" in err
        ? (err as { cause?: { code?: string } }).cause?.code
        : err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
    if (pgCode === "23505") {
      throw new TeamServiceError(
        409,
        "That account is already in the destination workspace.",
      );
    }
    throw err;
  }

  if (nextUserId !== account.userId) {
    const { syncConnectedAccountsToLimit } = await import("../plan-limits.js");
    await syncConnectedAccountsToLimit(nextUserId);
    await syncConnectedAccountsToLimit(account.userId);
  }

  // Connection counts in workspace lists are cached — refresh both sides.
  const teamIds = new Set<string>();
  if (currentId) {
    const from = await loadWorkspaceMeta(currentId);
    if (from) teamIds.add(from.teamId);
  }
  if (targetWorkspaceId) {
    const to = await loadWorkspaceMeta(targetWorkspaceId);
    if (to) teamIds.add(to.teamId);
  }
  await Promise.all(
    [...teamIds].map((id) => invalidateTeamWorkspacesCache(id)),
  );

  return { workspaceId: targetWorkspaceId };
}
