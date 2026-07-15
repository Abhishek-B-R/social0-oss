import type { FastifyInstance } from "fastify";
import { requireSessionUserId, unauthorized } from "../../middleware/auth.js";
import {
  TeamServiceError,
  acceptInvite,
  getTeamContextForUser,
  getTeamForUser,
  inviteMember,
  listInvitationsForUser,
  removeMember,
  revokeInvitation,
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
    if (status === 403) {
      return { status: 403, body: { error: "Forbidden" } };
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

    const body = (request.body ?? {}) as { email?: string; role?: string };
    try {
      const result = await inviteMember(userId, body.email ?? "", body.role);
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
}
