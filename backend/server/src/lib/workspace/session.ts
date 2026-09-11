import { auth } from "../auth.js";
import { headers } from "../http/request-cookies.js";
import {
  personalWorkspaceContext,
  resolveWorkspaceContext,
  type WorkspaceContext,
} from "./context.js";
import type { WorkspacePermission } from "./permissions.js";

export type WorkspaceSession =
  | { ok: true; ctx: WorkspaceContext }
  | { ok: false; error: string; statusCode: number };

const TEAMMATE_PRO_LAPSED_ERROR =
  "This team's Pro subscription is inactive. Ask the team owner to renew Pro so you can keep posting.";

/**
 * Resolve session + workspace context for dashboard/RPC handlers.
 * Collaboration uses the workspace owner's resource id; personal accounts use self.
 *
 * Teammates are blocked only when the owner's Pro has lapsed. Owners always
 * keep access to their own workspaces (including solo / multi-workspace plans).
 */
export async function requireWorkspaceSession(
  permission?: WorkspacePermission,
): Promise<WorkspaceSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized", statusCode: 401 };
  }

  const ctx = await resolveWorkspaceContext(session.user.id);

  if (ctx.inWorkspace && !ctx.teamsEnabled && !ctx.isOwner) {
    return {
      ok: false,
      error: TEAMMATE_PRO_LAPSED_ERROR,
      statusCode: 403,
    };
  }

  if (permission && !ctx.permissions.has(permission)) {
    return { ok: false, error: "Forbidden", statusCode: 403 };
  }

  return { ok: true, ctx };
}

/** Same as requireWorkspaceSession, but throws with Fastify `statusCode` on deny. */
export async function requireWorkspaceContext(
  permission?: WorkspacePermission,
): Promise<WorkspaceContext> {
  const ws = await requireWorkspaceSession(permission);
  if (!ws.ok) {
    const err = new Error(ws.error) as Error & { statusCode: number };
    err.statusCode = ws.statusCode;
    throw err;
  }
  return ws.ctx;
}

/**
 * Same as `requireWorkspacePermissionForUser`, but honours *how* the caller
 * authenticated.
 *
 * An API key is a personal-pool credential — `/v1` scopes every key to
 * `workspaceId: null`. Resolving the user's active workspace here instead would
 * let a key reach a team's connections and posts, which is a wider grant than
 * the key was issued for.
 */
export async function requireWorkspacePermissionForActor(
  actor: { userId: string; source: "session" | "apiKey" | "devHeader" },
  permission: WorkspacePermission,
): Promise<WorkspaceSession> {
  if (actor.source === "apiKey") {
    const ctx = personalWorkspaceContext(actor.userId);
    if (!ctx.permissions.has(permission)) {
      return { ok: false, error: "Forbidden", statusCode: 403 };
    }
    return { ok: true, ctx };
  }
  return requireWorkspacePermissionForUser(actor.userId, permission);
}

/** For REST handlers that already validated userId from the request. */
export async function requireWorkspacePermissionForUser(
  userId: string,
  permission: WorkspacePermission,
): Promise<WorkspaceSession> {
  const ctx = await resolveWorkspaceContext(userId);

  if (ctx.inWorkspace && !ctx.teamsEnabled && !ctx.isOwner) {
    return {
      ok: false,
      error: TEAMMATE_PRO_LAPSED_ERROR,
      statusCode: 403,
    };
  }

  if (!ctx.permissions.has(permission)) {
    return { ok: false, error: "Forbidden", statusCode: 403 };
  }

  return { ok: true, ctx };
}
