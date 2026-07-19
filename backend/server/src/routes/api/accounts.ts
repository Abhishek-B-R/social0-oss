import type { FastifyInstance } from "fastify";
import { and, count, eq } from "drizzle-orm";
import { requireUserId, unauthorized } from "../../middleware/auth.js";
import { db } from "../../db/index.js";
import { connectedAccounts, postPublications } from "../../db/schema.js";
import { decryptToken } from "@social0/shared";
import { revokeTokenOnPlatform } from "../../lib/revoke-token.js";
import type { Platform } from "../../lib/platforms.js";
import { requireWorkspacePermissionForUser } from "../../lib/workspace/session.js";
import { connectionScopeCondition } from "../../lib/workspace/context.js";

export async function registerAccountsRoutes(app: FastifyInstance) {
  app.get("/accounts", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const ws = await requireWorkspacePermissionForUser(
      userId,
      "view_connections",
    );
    if (!ws.ok) {
      return reply.status(ws.statusCode).send({ error: ws.error });
    }

    const accounts = await db.query.connectedAccounts.findMany({
      where: connectionScopeCondition(ws.ctx),
      columns: {
        id: true,
        platform: true,
        platformUsername: true,
        profileImageUrl: true,
        isActive: true,
        isTwitterPremium: true,
        tokenExpiresAt: true,
        tokenStatus: true,
        platformMetadata: true,
      },
    });

    return accounts;
  });

  app.get("/accounts/:id", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());
    const { id: accountId } = request.params as { id: string };

    const ws = await requireWorkspacePermissionForUser(
      userId,
      "view_connections",
    );
    if (!ws.ok) {
      return reply.status(ws.statusCode).send({ error: ws.error });
    }

    const [account] = await db
      .select({
        id: connectedAccounts.id,
        platform: connectedAccounts.platform,
        platformUsername: connectedAccounts.platformUsername,
      })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, accountId),
          connectionScopeCondition(ws.ctx)!,
        ),
      )
      .limit(1);

    if (!account) {
      return reply.status(404).send({ error: "Account not found" });
    }

    const [row] = await db
      .select({ value: count() })
      .from(postPublications)
      .where(eq(postPublications.connectedAccountId, accountId));

    return {
      ...account,
      publicationCount: Number(row?.value ?? 0),
    };
  });

  app.delete("/accounts/:id", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());
    const { id: accountId } = request.params as { id: string };

    const ws = await requireWorkspacePermissionForUser(
      userId,
      "manage_connections",
    );
    if (!ws.ok) {
      return reply.status(ws.statusCode).send({ error: ws.error });
    }

    const [account] = await db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, accountId),
          connectionScopeCondition(ws.ctx)!,
        ),
      )
      .limit(1);

    if (!account) {
      return reply.status(404).send({ error: "Account not found" });
    }

    try {
      const accessToken = decryptToken(
        account.encryptedAccessToken,
        account.id,
      );
      await revokeTokenOnPlatform(account.platform as Platform, accessToken);
    } catch {
      // best effort
    }

    await db
      .delete(connectedAccounts)
      .where(eq(connectedAccounts.id, accountId));

    return { success: true };
  });

  app.post("/accounts/refresh-premium", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());
    const { refreshTwitterPremium } = await import(
      "../../connect/refresh-twitter-premium.js"
    );
    const { runRouteHandler } = await import("../../lib/run-route-handler.js");
    await runRouteHandler(request, reply, refreshTwitterPremium);
  });
}
