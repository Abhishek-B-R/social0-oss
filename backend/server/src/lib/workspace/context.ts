import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  connectedAccounts,
  userSettings,
  workspaceMembers,
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
  ownerUserId: string | null;
  role: WorkspaceRole | null;
  isOwner: boolean;
  /** Owner currently has Pro (allowTeams) — collaboration features active. */
  teamsEnabled: boolean;
  /** True when the actor is inside a workspace (owned or joined). */
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
 * - `activeWorkspaceId = null` → explicit Personal/Main (own connections).
 * - Set id must be a membership; otherwise reset to Main.
 */
export async function resolveWorkspaceContext(
  actorUserId: string,
): Promise<WorkspaceContext> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, actorUserId),
    columns: { activeWorkspaceId: true },
  });

  const activeId = settings?.activeWorkspaceId ?? null;

  // Explicit personal Main — do not fall back to owned/joined workspaces.
  if (!activeId) {
    return personalContext(actorUserId);
  }

  const memberships = await db
    .select({
      membershipId: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      ownerUserId: workspaces.ownerUserId,
      workspaceName: workspaces.name,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, actorUserId));

  const selected =
    memberships.find((m) => m.workspaceId === activeId) ?? null;

  if (!selected) {
    await db
      .update(userSettings)
      .set({ activeWorkspaceId: null })
      .where(eq(userSettings.userId, actorUserId));
    return personalContext(actorUserId);
  }

  const isOwner = selected.ownerUserId === actorUserId;
  const teamsEnabled = await ownerHasTeams(selected.ownerUserId);
  const role = selected.role as WorkspaceRole;
  const permissions = permissionsForRole(role, {
    isOwner,
    teamsEnabled,
    inWorkspace: true,
  });

  return {
    actorUserId,
    resourceUserId: selected.ownerUserId,
    workspaceId: selected.workspaceId,
    workspaceName: selected.workspaceName,
    ownerUserId: selected.ownerUserId,
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

/** Ensure a paid/Pro owner has at least one workspace row + admin membership. */
export async function ensureOwnerWorkspace(
  ownerUserId: string,
  opts?: { name?: string },
): Promise<{ workspaceId: string; created: boolean }> {
  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerUserId, ownerUserId),
    columns: { id: true },
  });
  if (existing) {
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, existing.id),
        eq(workspaceMembers.userId, ownerUserId),
      ),
      columns: { id: true },
    });
    if (!membership) {
      await db.insert(workspaceMembers).values({
        workspaceId: existing.id,
        userId: ownerUserId,
        role: "admin",
      });
    }
    return { workspaceId: existing.id, created: false };
  }

  const name = opts?.name?.trim() || "My Workspace";
  const [created] = await db
    .insert(workspaces)
    .values({
      name,
      ownerUserId,
    })
    .returning({ id: workspaces.id });

  await db.insert(workspaceMembers).values({
    workspaceId: created.id,
    userId: ownerUserId,
    role: "admin",
  });

  return { workspaceId: created.id, created: true };
}

export async function setActiveWorkspace(
  actorUserId: string,
  workspaceId: string | null,
): Promise<WorkspaceContext> {
  if (workspaceId) {
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, actorUserId),
      ),
      columns: { id: true },
    });
    if (!membership) {
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
