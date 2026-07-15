import { auth } from "../auth.js";
import { headers } from "../http/request-cookies.js";
import { resolveWorkspaceContext, type WorkspaceContext } from "./context.js";
import type { WorkspacePermission } from "./permissions.js";

export type WorkspaceSession =
  | { ok: true; ctx: WorkspaceContext }
  | { ok: false; error: string; statusCode: number };

/**
 * Resolve session + workspace context for dashboard/RPC handlers.
 * Collaboration uses the workspace owner's resource id; personal accounts use self.
 */
export async function requireWorkspaceSession(
  permission?: WorkspacePermission,
): Promise<WorkspaceSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized", statusCode: 401 };
  }

  const ctx = await resolveWorkspaceContext(session.user.id);

  if (ctx.inWorkspace && !ctx.teamsEnabled) {
    return {
      ok: false,
      error:
        "Teams collaboration is paused because the workspace Pro subscription is inactive.",
      statusCode: 403,
    };
  }

  if (permission && !ctx.permissions.has(permission)) {
    return { ok: false, error: "Forbidden", statusCode: 403 };
  }

  return { ok: true, ctx };
}

/** For REST handlers that already validated userId from the request. */
export async function requireWorkspacePermissionForUser(
  userId: string,
  permission: WorkspacePermission,
): Promise<WorkspaceSession> {
  const ctx = await resolveWorkspaceContext(userId);

  if (ctx.inWorkspace && !ctx.teamsEnabled) {
    return {
      ok: false,
      error:
        "Teams collaboration is paused because the workspace Pro subscription is inactive.",
      statusCode: 403,
    };
  }

  if (!ctx.permissions.has(permission)) {
    return { ok: false, error: "Forbidden", statusCode: 403 };
  }

  return { ok: true, ctx };
}
