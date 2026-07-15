import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
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
  /** Owner currently has Pro (allowTeams). */
  teamsEnabled: boolean;
  /** True when the actor is collaborating inside a workspace. */
  inWorkspace: boolean;
  permissions: Set<WorkspacePermission>;
  permissionsDto: TeamPermissionsDto;
};

async function ownerHasTeams(ownerUserId: string): Promise<boolean> {
  const sub = await getSubscriptionForUser(ownerUserId);
  return getPlanLimits(sub.tier).allowTeams;
}

/**
 * Resolve the active Teams workspace for a user.
 * - Owned Pro workspace is preferred when activeWorkspaceId is unset.
 * - Non-owner memberships collaborate on the owner's resources.
 * - Solo users keep personal resource ownership.
 */
export async function resolveWorkspaceContext(
  actorUserId: string,
): Promise<WorkspaceContext> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, actorUserId),
    columns: { activeWorkspaceId: true },
  });

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

  let selected =
    memberships.find((m) => m.workspaceId === settings?.activeWorkspaceId) ??
    null;

  if (!selected) {
    selected =
      memberships.find((m) => m.ownerUserId === actorUserId) ??
      memberships[0] ??
      null;
  }

  if (!selected) {
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

/** Ensure a Pro owner has a workspace row + admin membership. */
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
    await db
      .update(userSettings)
      .set({ activeWorkspaceId: existing.id })
      .where(
        and(
          eq(userSettings.userId, ownerUserId),
          isNull(userSettings.activeWorkspaceId),
        ),
      );
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

  await db
    .insert(userSettings)
    .values({
      userId: ownerUserId,
      activeWorkspaceId: created.id,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { activeWorkspaceId: created.id },
    });

  return { workspaceId: created.id, created: true };
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
