import type { FastifyInstance } from "fastify";
import { requireSessionUserId, unauthorized } from "../../middleware/auth.js";
import {
  TeamServiceError,
  acceptInvite,
  acceptMyInvitation,
  createTeamForUser,
  createWorkspaceInTeam,
  declineMyInvitation,
  deleteTeamForUser,
  deleteWorkspaceInTeam,
  getTeamByIdForUser,
  getTeamContextForUser,
  getTeamForUser,
  inviteMember,
  leaveTeamForUser,
  listInvitationsForTeam,
  listInvitationsForUser,
  listMyPendingInvitations,
  listWorkspaceBoardForUser,
  listWorkspacesForUser,
  moveConnectedAccountToWorkspace,
  removeMember,
  renameTeamForUser,
  renameWorkspaceForUser,
  revokeInvitation,
  switchWorkspaceForUser,
  updateMemberRole,
} from "../../lib/workspace/team-service.js";
import {
  enforceRateLimit,
  rpcLimiter,
  rpcMutationLimiter,
} from "../../lib/ratelimit.js";

function serviceError(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof TeamServiceError) {
    return { status: err.statusCode, body: { error: err.message } };
  }
  if (err && typeof err === "object" && "statusCode" in err) {
    const status = Number((err as { statusCode: unknown }).statusCode);
    if (Number.isFinite(status) && status >= 400 && status < 600) {
      return {
        status,
        body: {
          error:
            err instanceof Error && err.message
              ? err.message
              : "Request failed",
        },
      };
    }
  }
  console.error("[team] unexpected error", err);
  return { status: 500, body: { error: "Internal server error" } };
}

export async function registerTeamRoutes(app: FastifyInstance) {
  app.get("/team", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(rpcLimiter, `team:get:${userId}`);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    try {
      return await getTeamForUser(userId);
    } catch (err) {
      const { status, body } = serviceError(err);
      return reply.status(status).send(body);
    }
  });

  app.get("/team/context", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(rpcLimiter, `team:context:${userId}`);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    try {
      return await getTeamContextForUser(userId);
    } catch (err) {
      const { status, body } = serviceError(err);
      return reply.status(status).send(body);
    }
  });

  app.get("/team/invitations", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(rpcLimiter, `team:invites:${userId}`);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    try {
      const invitations = await listInvitationsForUser(userId);
      return { invitations };
    } catch (err) {
      const { status, body } = serviceError(err);
      return reply.status(status).send(body);
    }
  });

  app.get("/team/my-invitations", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcLimiter,
      `team:my-invites:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    try {
      const invitations = await listMyPendingInvitations(userId);
      return { invitations };
    } catch (err) {
      const { status, body } = serviceError(err);
      return reply.status(status).send(body);
    }
  });

  app.post("/team/my-invitations/:id/accept", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:my-invite:accept:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { id } = request.params as { id: string };
    try {
      const result = await acceptMyInvitation(userId, id);
      return { success: true, ...result };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.post("/team/my-invitations/:id/decline", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:my-invite:decline:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { id } = request.params as { id: string };
    try {
      await declineMyInvitation(userId, id);
      return { success: true };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.post("/team/invite", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:invite:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const body = (request.body ?? {}) as {
      email?: string;
      role?: string;
      teamId?: string;
    };
    try {
      const result = await inviteMember(
        userId,
        body.email ?? "",
        body.role,
        body.teamId,
      );
      return reply.status(201).send({ success: true, ...result });
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.post("/team/accept", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:accept:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const body = (request.body ?? {}) as { token?: string };
    try {
      const result = await acceptInvite(userId, body.token ?? "");
      return { success: true, ...result };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.patch("/team/member/:id/role", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:role:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { role?: string };
    try {
      await updateMemberRole(userId, id, body.role);
      return { success: true };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.delete("/team/member/:id", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:remove:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { id } = request.params as { id: string };
    try {
      await removeMember(userId, id);
      return { success: true };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.delete("/team/invitation/:id", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:revoke:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { id } = request.params as { id: string };
    try {
      await revokeInvitation(userId, id);
      return { success: true };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.get("/team/workspaces", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(rpcLimiter, `team:workspaces:${userId}`);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    try {
      return await listWorkspacesForUser(userId);
    } catch (err) {
      const { status, body } = serviceError(err);
      return reply.status(status).send(body);
    }
  });

  app.get("/team/workspaces/board", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcLimiter,
      `team:workspaces:board:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    try {
      return await listWorkspaceBoardForUser(userId);
    } catch (err) {
      const { status, body } = serviceError(err);
      return reply.status(status).send(body);
    }
  });

  app.post("/team/accounts/:id/move", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:accounts:move:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { workspaceId?: string | null };

    try {
      const result = await moveConnectedAccountToWorkspace(
        userId,
        id,
        body.workspaceId === undefined ? null : body.workspaceId,
      );
      return { success: true, ...result };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.post("/team/workspaces", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:workspaces:create:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const body = (request.body ?? {}) as {
      name?: string;
      workspaceName?: string;
      teamId?: string;
      isCollaborative?: boolean;
      icon?: string;
    };

    try {
      if (body.teamId?.trim()) {
        const result = await createWorkspaceInTeam(
          userId,
          body.teamId.trim(),
          body.name ?? body.workspaceName,
          body.icon,
        );
        return reply.status(201).send({ success: true, ...result });
      }
      const result = await createTeamForUser(
        userId,
        body.name,
        body.workspaceName,
        {
          isCollaborative: body.isCollaborative !== false,
          icon: body.icon,
        },
      );
      return reply.status(201).send({ success: true, ...result });
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.post("/team", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:create:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const body = (request.body ?? {}) as {
      name?: string;
      workspaceName?: string;
      isCollaborative?: boolean;
      icon?: string;
    };
    try {
      const result = await createTeamForUser(
        userId,
        body.name,
        body.workspaceName,
        {
          // POST /team is the explicit "create team" path — always collaborative
          // unless a solo workspace container is requested.
          isCollaborative: body.isCollaborative !== false,
          icon: body.icon,
        },
      );
      return reply.status(201).send({ success: true, ...result });
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.patch("/team/workspaces/:id", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:workspaces:rename:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { name?: string };
    try {
      const result = await renameWorkspaceForUser(userId, id, body.name);
      return { success: true, ...result };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.delete("/team/workspaces/:id", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:workspaces:delete:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { id } = request.params as { id: string };
    try {
      const result = await deleteWorkspaceInTeam(userId, id);
      return { success: true, ...result };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.post("/team/switch", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:switch:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const body = (request.body ?? {}) as { workspaceId?: string | null };
    try {
      const result = await switchWorkspaceForUser(
        userId,
        body.workspaceId === undefined ? null : body.workspaceId,
      );
      return { success: true, ...result };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.post("/team/leave", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:leave:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const body = (request.body ?? {}) as {
      teamId?: string;
      workspaceId?: string;
    };
    try {
      if (body.teamId?.trim()) {
        await leaveTeamForUser(userId, body.teamId.trim());
      } else if (body.workspaceId?.trim()) {
        const { leaveWorkspaceForUser } = await import(
          "../../lib/workspace/team-service.js"
        );
        await leaveWorkspaceForUser(userId, body.workspaceId.trim());
      } else {
        throw new TeamServiceError(400, "Team id is required.");
      }
      return { success: true };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  // Parameterized team routes last so they don't swallow static paths.
  app.get("/team/:teamId", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(rpcLimiter, `team:get-id:${userId}`);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { teamId } = request.params as { teamId: string };
    try {
      return await getTeamByIdForUser(userId, teamId);
    } catch (err) {
      const { status, body } = serviceError(err);
      return reply.status(status).send(body);
    }
  });

  app.get("/team/:teamId/invitations", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcLimiter,
      `team:invites-id:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { teamId } = request.params as { teamId: string };
    try {
      const invitations = await listInvitationsForTeam(userId, teamId);
      return { invitations };
    } catch (err) {
      const { status, body } = serviceError(err);
      return reply.status(status).send(body);
    }
  });

  app.patch("/team/:teamId", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:rename:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { teamId } = request.params as { teamId: string };
    const body = (request.body ?? {}) as { name?: string };
    try {
      const result = await renameTeamForUser(userId, teamId, body.name);
      return { success: true, ...result };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.delete("/team/:teamId", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:delete:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { teamId } = request.params as { teamId: string };
    const body = (request.body ?? {}) as { keepConnections?: boolean };
    try {
      const result = await deleteTeamForUser(userId, teamId, {
        keepConnections: body.keepConnections === true,
      });
      return { success: true, ...result };
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });

  app.post("/team/:teamId/workspaces", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `team:ws-create:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const { teamId } = request.params as { teamId: string };
    const body = (request.body ?? {}) as { name?: string; icon?: string };
    try {
      const result = await createWorkspaceInTeam(
        userId,
        teamId,
        body.name,
        body.icon,
      );
      return reply.status(201).send({ success: true, ...result });
    } catch (err) {
      const { status, body: errBody } = serviceError(err);
      return reply.status(status).send(errBody);
    }
  });
}
