/**
 * Opt-in team workspaces on `/v1`.
 *
 * A call without `?workspace_id=` acts on the caller's personal (main) pool,
 * as `/v1` always has. With it, the call acts inside that workspace, as the
 * caller's team role there allows: an analyst can only read analytics, a
 * community member only the inbox. A key never picks up the dashboard's
 * active workspace on its own.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { apiError } from "./api-errors.js";
import { isValidUUID } from "./validation.js";
import {
  personalWorkspaceContext,
  workspaceContextFor,
  type WorkspaceContext,
} from "./workspace/context.js";
import type { WorkspacePermission } from "./workspace/permissions.js";

/**
 * Role permission each `/v1` route needs inside a workspace (any one of a
 * list), keyed like `V1_ROUTE_SCOPES`. `null` = account-level, not workspace-scoped (a
 * `workspace_id` there is refused). `v1-workspace.test.ts` keeps it in step
 * with `V1_ROUTE_SCOPES`.
 */
type RoutePermission = WorkspacePermission | readonly WorkspacePermission[];

export const V1_ROUTE_PERMISSIONS: Readonly<Record<string, RoutePermission | null>> = {
  "GET /v1/me": null,
  "GET /v1/workspaces": null,
  "GET /v1/accounts": "view_connections",
  "POST /v1/accounts/connect": "manage_connections",
  "DELETE /v1/accounts/:id": "manage_connections",
  "GET /v1/posts": "view_posts",
  "POST /v1/posts": "create_posts",
  "POST /v1/posts/bulk-delete": "delete_posts",
  "GET /v1/posts/:id": "view_posts",
  "PATCH /v1/posts/:id": "edit_posts",
  "DELETE /v1/posts/:id": "delete_posts",
  "GET /v1/posts/:id/events": "view_posts",
  "POST /v1/posts/:id/publish": "publish_posts",
  "POST /v1/posts/:id/schedule": "publish_posts",
  "POST /v1/posts/:id/duplicate": "create_posts",
  "POST /v1/posts/:id/post-again": "publish_posts",
  "PUT /v1/posts/:id/auto-plug": "edit_posts",
  "DELETE /v1/posts/:id/auto-plug": "edit_posts",
  "PUT /v1/posts/:id/auto-repost": "edit_posts",
  "DELETE /v1/posts/:id/auto-repost": "edit_posts",
  "POST /v1/posts/publish": "publish_posts",
  "POST /v1/posts/schedule": "publish_posts",
  "GET /v1/jobs/:trackingId": "view_posts",
  "GET /v1/jobs/:trackingId/stream": "view_posts",
  // Inbox replies attach media too, as on the dashboard (routes/api/media.ts).
  "POST /v1/media/presign": ["create_posts", "reply_comments", "reply_dms"],
  "POST /v1/media/confirm": ["create_posts", "reply_comments", "reply_dms"],
  "GET /v1/media/:id": "view_posts",
  "GET /v1/webhooks": null,
  "POST /v1/webhooks": null,
  "GET /v1/webhooks/:id": null,
  "PATCH /v1/webhooks/:id": null,
  "DELETE /v1/webhooks/:id": null,
  "GET /v1/webhooks/:id/deliveries": null,
  "POST /v1/webhooks/:id/test": null,
  "GET /v1/analytics/accounts": "view_analytics",
  "GET /v1/analytics/overview": "view_analytics",
  "GET /v1/analytics/posts/:postId": "view_analytics",
  "GET /v1/inbox/accounts": "view_inbox",
  "GET /v1/inbox/comments": "view_inbox",
  "POST /v1/inbox/comments/:commentId/reply": "reply_comments",
  "POST /v1/inbox/comments/:commentId/like": "reply_comments",
  "POST /v1/inbox/comments/:commentId/hide": "reply_comments",
  "GET /v1/inbox/dms": "view_inbox",
  "GET /v1/inbox/dms/:conversationId": "view_inbox",
  "POST /v1/inbox/dms/:conversationId/reply": "reply_dms",
};

/** Who a `/v1` call acts for: `userId` owns the posts/accounts (the workspace owner), `actorUserId` is the caller. */
export type V1Scope = {
  userId: string;
  workspaceId: string | null;
  actorUserId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    v1Workspace?: WorkspaceContext;
  }
}

const TEAMMATE_LAPSED =
  "This team's plan is inactive. Ask the team owner to renew it to keep using this workspace.";

/** Run after the caller is authenticated. Sends the error and returns false when the call may not go ahead. */
export async function resolveV1Workspace(
  request: FastifyRequest,
  reply: FastifyReply,
  actorUserId: string,
): Promise<boolean> {
  const raw = (request.query as Record<string, unknown> | undefined)?.workspace_id;
  if (raw === undefined || raw === "") {
    request.v1Workspace = personalWorkspaceContext(actorUserId);
    return true;
  }
  if (typeof raw !== "string" || !isValidUUID(raw)) {
    reply.status(400).send(apiError("validation_error", "workspace_id must be a workspace UUID."));
    return false;
  }

  const routeKey = `${request.method.toUpperCase()} ${request.routeOptions.url}`;
  const permission = V1_ROUTE_PERMISSIONS[routeKey];
  if (!permission) {
    reply
      .status(400)
      .send(apiError("validation_error", "This endpoint is account-level and does not take workspace_id."));
    return false;
  }

  const ctx = await workspaceContextFor(actorUserId, raw.toLowerCase());
  if (!ctx) {
    reply.status(404).send(apiError("not_found", "Workspace not found."));
    return false;
  }
  if (!ctx.teamsEnabled && !ctx.isOwner) {
    reply.status(403).send(apiError("forbidden", TEAMMATE_LAPSED));
    return false;
  }
  const accepted: readonly WorkspacePermission[] =
    typeof permission === "string" ? [permission] : permission;
  if (!accepted.some((p) => ctx.permissions.has(p))) {
    reply
      .status(403)
      .send(
        apiError("forbidden", `Your role in this workspace (${ctx.role}) can't do this.`, {
          required_permission: accepted.join(" | "),
        }),
      );
    return false;
  }
  request.v1Workspace = ctx;
  return true;
}

export function v1Scope(request: FastifyRequest): V1Scope {
  const ctx = request.v1Workspace!;
  return {
    userId: ctx.resourceUserId,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
  };
}
