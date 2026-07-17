import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  connectedAccounts,
  teamMembers,
  teams,
  userSettings,
  workspaces,
} from "../../db/schema.js";
import { getSubscriptionForUser } from "../subscription.js";
import { getPlanLimits } from "@social0/shared";
import {
  permissionsForRole,
  toPermissionsDto,
  type TeamPermissionsDto,
  type WorkspacePermission,
  type WorkspaceRole,
} from "./permissions.js";

export type WorkspaceContext = {
  actorUserId: string;
  /** User id that owns posts / connections / plan limits for this session. */
  resourceUserId: string;
  workspaceId: string | null;
  workspaceName: string | null;
  teamId: string | null;
  teamName: string | null;
  ownerUserId: string | null;
  role: WorkspaceRole | null;
  isOwner: boolean;
  /** Owner currently has Pro (allowTeams) — collaboration features active. */
  teamsEnabled: boolean;
  /** True when the actor is inside a team workspace (owned or joined). */
  inWorkspace: boolean;
  permissions: Set<WorkspacePermission>;
  permissionsDto: TeamPermissionsDto;
};

async function ownerHasTeams(ownerUserId: string): Promise<boolean> {
  const sub = await getSubscriptionForUser(ownerUserId);
  return getPlanLimits(sub.tier).allowTeams;
}

function personalContext(actorUserId: string): WorkspaceContext {
  const permissions = permissionsForRole(null, {
    isOwner: true,
    teamsEnabled: false,
    inWorkspace: false,
  });
  return {
    actorUserId,
    resourceUserId: actorUserId,
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
 * Resolve the active workspace for a user.
 * - `activeWorkspaceId = null` → Personal/Main.
 * - Set id must belong to a team the actor is a member of.
 */
export async function resolveWorkspaceContext(
  actorUserId: string,
): Promise<WorkspaceContext> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, actorUserId),
    columns: { activeWorkspaceId: true },
  });

  const activeId = settings?.activeWorkspaceId ?? null;
  if (!activeId) {
    return personalContext(actorUserId);
  }

  const [row] = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      teamId: teams.id,
      teamName: teams.name,
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
    .where(eq(workspaces.id, activeId))
    .limit(1);

  if (!row) {
    await db
      .update(userSettings)
      .set({ activeWorkspaceId: null })
      .where(eq(userSettings.userId, actorUserId));
    return personalContext(actorUserId);
  }

  const isOwner = row.ownerUserId === actorUserId;
  const teamsEnabled = await ownerHasTeams(row.ownerUserId);
  const role = row.role as WorkspaceRole;
  const permissions = permissionsForRole(role, {
    isOwner,
    teamsEnabled,
    inWorkspace: true,
  });

  return {
    actorUserId,
    resourceUserId: row.ownerUserId,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    teamId: row.teamId,
    teamName: row.teamName,
    ownerUserId: row.ownerUserId,
    role,
    isOwner,
    teamsEnabled,
    inWorkspace: true,
    permissions,
    permissionsDto: toPermissionsDto(permissions),
  };
}

/** SQL filter for connections visible in the current context. */
export function connectionScopeCondition(ctx: {
  resourceUserId: string;
  workspaceId: string | null;
}) {
  if (ctx.workspaceId) {
    return and(
      eq(connectedAccounts.userId, ctx.resourceUserId),
      eq(connectedAccounts.workspaceId, ctx.workspaceId),
    );
  }
  return and(
    eq(connectedAccounts.userId, ctx.resourceUserId),
    isNull(connectedAccounts.workspaceId),
  );
}

/** Ensure Pro owner has at least one team + workspace. */
export async function ensureOwnerTeam(
  ownerUserId: string,
  opts?: { name?: string },
): Promise<{ teamId: string; workspaceId: string; created: boolean }> {
  const existingTeam = await db.query.teams.findFirst({
    where: eq(teams.ownerUserId, ownerUserId),
    columns: { id: true, name: true },
  });

  if (existingTeam) {
    let ws = await db.query.workspaces.findFirst({
      where: eq(workspaces.teamId, existingTeam.id),
      columns: { id: true },
    });
    if (!ws) {
      const [createdWs] = await db
        .insert(workspaces)
        .values({
          name: existingTeam.name,
          teamId: existingTeam.id,
        })
        .returning({ id: workspaces.id });
      ws = createdWs;
      await db
        .update(teams)
        .set({ defaultWorkspaceId: createdWs.id, updatedAt: new Date() })
        .where(eq(teams.id, existingTeam.id));
    } else {
      const teamRow = await db.query.teams.findFirst({
        where: eq(teams.id, existingTeam.id),
        columns: { defaultWorkspaceId: true },
      });
      if (!teamRow?.defaultWorkspaceId) {
        await db
          .update(teams)
          .set({ defaultWorkspaceId: ws.id, updatedAt: new Date() })
          .where(eq(teams.id, existingTeam.id));
      }
    }
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, existingTeam.id),
        eq(teamMembers.userId, ownerUserId),
      ),
      columns: { id: true },
    });
    if (!membership) {
      await db.insert(teamMembers).values({
        teamId: existingTeam.id,
        userId: ownerUserId,
        role: "admin",
      });
    }
    return {
      teamId: existingTeam.id,
      workspaceId: ws.id,
      created: false,
    };
  }

  const name = opts?.name?.trim() || "My Team";
  const [createdTeam] = await db
    .insert(teams)
    .values({ name, ownerUserId })
    .returning({ id: teams.id });

  await db.insert(teamMembers).values({
    teamId: createdTeam.id,
    userId: ownerUserId,
    role: "admin",
  });

  const [createdWs] = await db
    .insert(workspaces)
    .values({ name, teamId: createdTeam.id })
    .returning({ id: workspaces.id });

  await db
    .update(teams)
    .set({ defaultWorkspaceId: createdWs.id, updatedAt: new Date() })
    .where(eq(teams.id, createdTeam.id));

  return {
    teamId: createdTeam.id,
    workspaceId: createdWs.id,
    created: true,
  };
}

/** @deprecated use ensureOwnerTeam */
export async function ensureOwnerWorkspace(
  ownerUserId: string,
  opts?: { name?: string },
): Promise<{ workspaceId: string; created: boolean }> {
  const result = await ensureOwnerTeam(ownerUserId, opts);
  return { workspaceId: result.workspaceId, created: result.created };
}

export async function setActiveWorkspace(
  actorUserId: string,
  workspaceId: string | null,
): Promise<WorkspaceContext> {
  if (workspaceId) {
    const [row] = await db
      .select({ id: workspaces.id })
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
      const err = new Error("Not a member of this workspace");
      (err as Error & { statusCode: number }).statusCode = 403;
      throw err;
    }
  }

  await db
    .insert(userSettings)
    .values({
      userId: actorUserId,
      activeWorkspaceId: workspaceId,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { activeWorkspaceId: workspaceId },
    });

  return resolveWorkspaceContext(actorUserId);
}

export async function countConnectionsInWorkspace(
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.workspaceId, workspaceId));
  return row?.count ?? 0;
}

export async function requireWorkspacePermission(
  actorUserId: string,
  permission: WorkspacePermission,
): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(actorUserId);
  if (!ctx.permissions.has(permission)) {
    const err = new Error("Forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return ctx;
}
