import { randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  user,
  userSettings,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
  connectedAccounts,
} from "../../db/schema.js";
import { getSubscriptionForUser } from "../subscription.js";
import { getPlanLimits } from "@social0/shared";
import {
  countConnectionsInWorkspace,
  ensureOwnerWorkspace,
  resolveWorkspaceContext,
  setActiveWorkspace,
} from "./context.js";
import {
  isWorkspaceRole,
  type TeamPermissionsDto,
  type WorkspaceRole,
} from "./permissions.js";
import {
  sendWorkspaceInviteAcceptedEmail,
  sendWorkspaceInviteEmail,
  sendWorkspaceMemberRemovedEmail,
  sendWorkspaceRoleChangedEmail,
} from "./emails.js";

export const INVITE_EXPIRY_DAYS = Number(
  process.env.WORKSPACE_INVITE_EXPIRY_DAYS ?? "7",
);

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

export type TeamGetResponse = {
  workspace: { id: string; name: string; ownerUserId: string } | null;
  members: TeamMemberDto[];
  permissions: TeamPermissionsDto;
  teamsEnabled: boolean;
  upgradeRequired: boolean;
  role: WorkspaceRole | null;
  isOwner: boolean;
};

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
    await ensureOwnerWorkspace(actorUserId);
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
  if (!ctx.workspaceId || !ctx.ownerUserId) {
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

export async function getTeamForUser(
  actorUserId: string,
): Promise<TeamGetResponse> {
  const sub = await getSubscriptionForUser(actorUserId);
  const actorAllowTeams = getPlanLimits(sub.tier).allowTeams;

  let ctx = await resolveWorkspaceContext(actorUserId);

  // Pro owners on Main: ensure a workspace exists and switch into it for Teams UI.
  if (actorAllowTeams && !ctx.workspaceId) {
    const { workspaceId } = await ensureOwnerWorkspace(actorUserId);
    ctx = await setActiveWorkspace(actorUserId, workspaceId);
  }

  if (!ctx.workspaceId || !ctx.ownerUserId) {
    return {
      workspace: null,
      members: [],
      permissions: ctx.permissionsDto,
      teamsEnabled: actorAllowTeams,
      upgradeRequired: !actorAllowTeams,
      role: null,
      isOwner: true,
    };
  }

  const memberRows = await db
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
      email: user.email,
      name: user.name,
      image: user.image,
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(eq(workspaceMembers.workspaceId, ctx.workspaceId));

  const members: TeamMemberDto[] = memberRows.map((row) => ({
    id: row.id,
    userId: row.userId,
    email: row.email,
    name: row.name,
    image: row.image,
    role: row.role as WorkspaceRole,
    isOwner: row.userId === ctx.ownerUserId,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  }));

  members.sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.email.localeCompare(b.email);
  });

  return {
    workspace: {
      id: ctx.workspaceId,
      name: ctx.workspaceName ?? "Workspace",
      ownerUserId: ctx.ownerUserId,
    },
    members,
    permissions: ctx.permissionsDto,
    teamsEnabled: ctx.teamsEnabled,
    upgradeRequired: false,
    role: ctx.role,
    isOwner: ctx.isOwner,
  };
}

export async function listInvitationsForUser(
  actorUserId: string,
): Promise<TeamInvitationDto[]> {
  const ctx = await resolveWorkspaceContext(actorUserId);
  if (!ctx.workspaceId) return [];
  if (!ctx.permissions.has("invite_users") && !ctx.teamsEnabled) {
    return [];
  }
  // Members can see pending invites only if admin; otherwise empty
  if (!ctx.permissions.has("invite_users")) {
    return [];
  }

  const rows = await db
    .select({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      expiresAt: workspaceInvitations.expiresAt,
      createdAt: workspaceInvitations.createdAt,
      invitedByName: user.name,
    })
    .from(workspaceInvitations)
    .leftJoin(user, eq(workspaceInvitations.invitedByUserId, user.id))
    .where(
      and(
        eq(workspaceInvitations.workspaceId, ctx.workspaceId),
        isNull(workspaceInvitations.acceptedAt),
        isNull(workspaceInvitations.revokedAt),
        gt(workspaceInvitations.expiresAt, new Date()),
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
): Promise<{ invitationId: string }> {
  if (!isWorkspaceRole(roleRaw)) {
    throw new TeamServiceError(400, "Invalid role. Use 'admin' or 'member'.");
  }
  const email = normalizeEmail(emailRaw);
  if (!email || !email.includes("@")) {
    throw new TeamServiceError(400, "A valid email is required.");
  }

  const ctx = await requireAdminTeamsContext(actorUserId);
  const workspaceId = ctx.workspaceId!;

  const existingUser = await db.query.user.findFirst({
    where: sql`lower(${user.email}) = ${email}`,
    columns: { id: true, email: true },
  });

  if (existingUser) {
    const alreadyMember = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, existingUser.id),
      ),
      columns: { id: true },
    });
    if (alreadyMember) {
      throw new TeamServiceError(409, "That user is already in this workspace.");
    }
  }

  const activeInvite = await db.query.workspaceInvitations.findFirst({
    where: and(
      eq(workspaceInvitations.workspaceId, workspaceId),
      sql`lower(${workspaceInvitations.email}) = ${email}`,
      isNull(workspaceInvitations.acceptedAt),
      isNull(workspaceInvitations.revokedAt),
      gt(workspaceInvitations.expiresAt, new Date()),
    ),
    columns: { id: true },
  });
  if (activeInvite) {
    throw new TeamServiceError(
      409,
      "An active invitation already exists for this email.",
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
    .insert(workspaceInvitations)
    .values({
      workspaceId,
      email,
      role: roleRaw,
      token,
      invitedByUserId: actorUserId,
      expiresAt,
    })
    .returning({ id: workspaceInvitations.id });

  try {
    await sendWorkspaceInviteEmail({
      to: email,
      workspaceName: ctx.workspaceName ?? "Workspace",
      inviterName: actor?.name?.trim() || actor?.email || "A teammate",
      role: roleRaw,
      token,
    });
  } catch (err) {
    await db
      .delete(workspaceInvitations)
      .where(eq(workspaceInvitations.id, invite.id));
    throw new TeamServiceError(
      502,
      err instanceof Error
        ? `Failed to send invitation email: ${err.message}`
        : "Failed to send invitation email",
    );
  }

  return { invitationId: invite.id };
}

export async function acceptInvite(
  actorUserId: string,
  token: string,
): Promise<{ workspaceId: string }> {
  if (!token?.trim()) {
    throw new TeamServiceError(400, "Invitation token is required.");
  }

  const invite = await db.query.workspaceInvitations.findFirst({
    where: eq(workspaceInvitations.token, token.trim()),
  });

  if (!invite || invite.revokedAt) {
    throw new TeamServiceError(410, "This invitation is no longer valid.");
  }
  if (invite.expiresAt.getTime() < Date.now() && !invite.acceptedAt) {
    throw new TeamServiceError(410, "This invitation has expired.");
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, invite.workspaceId),
  });
  if (!workspace) {
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

  const existing = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, invite.workspaceId),
      eq(workspaceMembers.userId, actorUserId),
    ),
    columns: { id: true },
  });

  // Idempotent: Strict Mode / double-submit may hit accept twice.
  if (invite.acceptedAt || existing) {
    if (!existing) {
      throw new TeamServiceError(
        409,
        "This invitation has already been accepted.",
      );
    }
    await db
      .insert(userSettings)
      .values({
        userId: actorUserId,
        activeWorkspaceId: invite.workspaceId,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { activeWorkspaceId: invite.workspaceId },
      });
    return { workspaceId: invite.workspaceId };
  }

  const teamsEnabled = getPlanLimits(
    (await getSubscriptionForUser(workspace.ownerUserId)).tier,
  ).allowTeams;
  if (!teamsEnabled) {
    throw new TeamServiceError(
      403,
      "This workspace’s Pro subscription is inactive. Teams invites can’t be accepted right now.",
    );
  }

  await db
    .insert(workspaceMembers)
    .values({
      workspaceId: invite.workspaceId,
      userId: actorUserId,
      role: invite.role,
    })
    .onConflictDoNothing();

  await db
    .update(workspaceInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(workspaceInvitations.id, invite.id));

  await db
    .insert(userSettings)
    .values({
      userId: actorUserId,
      activeWorkspaceId: invite.workspaceId,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { activeWorkspaceId: invite.workspaceId },
    });

  const owner = await db.query.user.findFirst({
    where: eq(user.id, workspace.ownerUserId),
    columns: { email: true },
  });
  if (owner?.email) {
    try {
      await sendWorkspaceInviteAcceptedEmail({
        to: owner.email,
        workspaceName: workspace.name,
        memberName: actor.name ?? actor.email,
        memberEmail: actor.email,
      });
    } catch {
      // non-blocking
    }
  }

  return { workspaceId: invite.workspaceId };
}

export async function updateMemberRole(
  actorUserId: string,
  memberId: string,
  roleRaw: unknown,
): Promise<void> {
  if (!isWorkspaceRole(roleRaw)) {
    throw new TeamServiceError(400, "Invalid role. Use 'admin' or 'member'.");
  }

  const ctx = await requireAdminTeamsContext(actorUserId);
  if (!ctx.permissions.has("change_roles")) {
    throw new TeamServiceError(403, "Forbidden");
  }

  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.id, memberId),
      eq(workspaceMembers.workspaceId, ctx.workspaceId!),
    ),
  });
  if (!member) {
    throw new TeamServiceError(404, "Member not found");
  }

  if (member.userId === ctx.ownerUserId) {
    throw new TeamServiceError(400, "The workspace owner must remain an Admin.");
  }

  if (member.role === "admin" && roleRaw === "member") {
    const [adminCount] = await db
      .select({ value: count() })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, ctx.workspaceId!),
          eq(workspaceMembers.role, "admin"),
        ),
      );
    if ((adminCount?.value ?? 0) <= 1) {
      throw new TeamServiceError(
        400,
        "Cannot demote the last remaining Admin.",
      );
    }
  }

  if (member.role === roleRaw) return;

  await db
    .update(workspaceMembers)
    .set({ role: roleRaw, updatedAt: new Date() })
    .where(eq(workspaceMembers.id, memberId));

  const target = await db.query.user.findFirst({
    where: eq(user.id, member.userId),
    columns: { email: true },
  });
  if (target?.email) {
    try {
      await sendWorkspaceRoleChangedEmail({
        to: target.email,
        workspaceName: ctx.workspaceName ?? "Workspace",
        role: roleRaw,
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
  const ctx = await requireAdminTeamsContext(actorUserId);
  if (!ctx.permissions.has("remove_users")) {
    throw new TeamServiceError(403, "Forbidden");
  }

  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.id, memberId),
      eq(workspaceMembers.workspaceId, ctx.workspaceId!),
    ),
  });
  if (!member) {
    throw new TeamServiceError(404, "Member not found");
  }

  if (member.userId === ctx.ownerUserId) {
    throw new TeamServiceError(400, "The workspace owner cannot be removed.");
  }

  if (member.userId === actorUserId && ctx.isOwner) {
    throw new TeamServiceError(400, "The workspace owner cannot leave the workspace.");
  }

  if (member.role === "admin") {
    const [adminCount] = await db
      .select({ value: count() })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, ctx.workspaceId!),
          eq(workspaceMembers.role, "admin"),
        ),
      );
    if ((adminCount?.value ?? 0) <= 1) {
      throw new TeamServiceError(400, "Cannot remove the last remaining Admin.");
    }
  }

  const target = await db.query.user.findFirst({
    where: eq(user.id, member.userId),
    columns: { email: true },
  });

  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, memberId));

  await db
    .update(userSettings)
    .set({ activeWorkspaceId: null })
    .where(
      and(
        eq(userSettings.userId, member.userId),
        eq(userSettings.activeWorkspaceId, ctx.workspaceId!),
      ),
    );

  if (target?.email) {
    try {
      await sendWorkspaceMemberRemovedEmail({
        to: target.email,
        workspaceName: ctx.workspaceName ?? "Workspace",
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
  const ctx = await requireAdminTeamsContext(actorUserId);

  const invite = await db.query.workspaceInvitations.findFirst({
    where: and(
      eq(workspaceInvitations.id, invitationId),
      eq(workspaceInvitations.workspaceId, ctx.workspaceId!),
    ),
  });
  if (!invite) {
    throw new TeamServiceError(404, "Invitation not found");
  }
  if (invite.acceptedAt) {
    throw new TeamServiceError(409, "Invitation already accepted");
  }

  await db
    .update(workspaceInvitations)
    .set({ revokedAt: new Date() })
    .where(eq(workspaceInvitations.id, invitationId));
}

export async function getTeamContextForUser(actorUserId: string) {
  const ctx = await resolveWorkspaceContext(actorUserId);
  return {
    role: ctx.role,
    permissions: ctx.permissionsDto,
    resourceOwnerId: ctx.resourceUserId,
    teamsEnabled: ctx.teamsEnabled,
    workspaceId: ctx.workspaceId,
    isOwner: ctx.isOwner,
  };
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

export async function listWorkspacesForUser(
  actorUserId: string,
): Promise<{ workspaces: WorkspaceListItem[]; canCreate: boolean }> {
  const sub = await getSubscriptionForUser(actorUserId);
  const canCreate = getPlanLimits(sub.tier).allowMultiWorkspace;
  const ctx = await resolveWorkspaceContext(actorUserId);

  const [personalCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, actorUserId),
        isNull(connectedAccounts.workspaceId),
      ),
    );

  const memberships = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      ownerUserId: workspaces.ownerUserId,
      name: workspaces.name,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, actorUserId));

  const items: WorkspaceListItem[] = [
    {
      id: null,
      name: "Main",
      kind: "personal",
      role: null,
      isOwner: true,
      isActive: !ctx.workspaceId,
      connectionCount: personalCountRow?.count ?? 0,
    },
  ];

  for (const m of memberships) {
    const connectionCount = await countConnectionsInWorkspace(m.workspaceId);
    const isOwner = m.ownerUserId === actorUserId;
    items.push({
      id: m.workspaceId,
      name: m.name,
      kind: isOwner ? "owned" : "joined",
      role: m.role as WorkspaceRole,
      isOwner,
      isActive: ctx.workspaceId === m.workspaceId,
      connectionCount,
    });
  }

  items.sort((a, b) => {
    if (a.kind === "personal") return -1;
    if (b.kind === "personal") return 1;
    if (a.kind !== b.kind) return a.kind === "owned" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { workspaces: items, canCreate };
}

export async function createWorkspaceForUser(
  actorUserId: string,
  nameRaw: unknown,
): Promise<{ workspaceId: string }> {
  const sub = await getSubscriptionForUser(actorUserId);
  if (!getPlanLimits(sub.tier).allowMultiWorkspace) {
    throw new TeamServiceError(
      403,
      "Creating workspaces requires a paid plan.",
    );
  }

  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim().slice(0, 80)
      : "New Workspace";

  const owned = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, actorUserId));

  for (const ws of owned) {
    const n = await countConnectionsInWorkspace(ws.id);
    if (n < 1) {
      throw new TeamServiceError(
        400,
        `Connect at least one account to "${ws.name}" before creating another workspace.`,
      );
    }
  }

  const [created] = await db
    .insert(workspaces)
    .values({ name, ownerUserId: actorUserId })
    .returning({ id: workspaces.id });

  await db.insert(workspaceMembers).values({
    workspaceId: created.id,
    userId: actorUserId,
    role: "admin",
  });

  await setActiveWorkspace(actorUserId, created.id);
  return { workspaceId: created.id };
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

export async function leaveWorkspaceForUser(
  actorUserId: string,
  workspaceId: string,
): Promise<void> {
  if (!workspaceId?.trim()) {
    throw new TeamServiceError(400, "Workspace id is required.");
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { id: true, ownerUserId: true },
  });
  if (!workspace) {
    throw new TeamServiceError(404, "Workspace not found.");
  }
  if (workspace.ownerUserId === actorUserId) {
    throw new TeamServiceError(
      400,
      "Owners can’t leave their workspace. Remove members or delete it instead.",
    );
  }

  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, actorUserId),
    ),
    columns: { id: true },
  });
  if (!membership) {
    throw new TeamServiceError(404, "You are not a member of this workspace.");
  }

  await db
    .delete(workspaceMembers)
    .where(eq(workspaceMembers.id, membership.id));

  await db
    .update(userSettings)
    .set({ activeWorkspaceId: null })
    .where(
      and(
        eq(userSettings.userId, actorUserId),
        eq(userSettings.activeWorkspaceId, workspaceId),
      ),
    );
}
