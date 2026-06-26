import type { FastifyInstance } from "fastify";
import { and, count, eq } from "drizzle-orm";
import { requireUserId, unauthorized } from "../../middleware/auth.js";
import { db } from "../../db/index.js";
import { connectedAccounts, postPublications } from "../../db/schema.js";
import { decryptToken } from "../../lib/encryption.js";
import { revokeTokenOnPlatform } from "../../lib/revoke-token.js";
import {
  fetchAvatarBytes,
  fetchRemoteAvatarUrl,
} from "../../lib/account-avatar.js";
import type { Platform } from "../../lib/platforms.js";

export async function registerAccountsRoutes(app: FastifyInstance) {
  app.get("/accounts", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const accounts = await db.query.connectedAccounts.findMany({
      where: eq(connectedAccounts.userId, userId),
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

  app.get("/accounts/:id/avatar", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());
    const { id: accountId } = request.params as { id: string };

    const [account] = await db
      .select({
        id: connectedAccounts.id,
        platform: connectedAccounts.platform,
        platformUserId: connectedAccounts.platformUserId,
        profileImageUrl: connectedAccounts.profileImageUrl,
        platformMetadata: connectedAccounts.platformMetadata,
      })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, accountId),
          eq(connectedAccounts.userId, userId),
        ),
      )
      .limit(1);

    if (!account) {
      return reply.status(404).send({ error: "Account not found" });
    }

    const remoteUrl = await fetchRemoteAvatarUrl({
      id: account.id,
      platform: account.platform,
      platformUserId: account.platformUserId,
      profileImageUrl: account.profileImageUrl,
      platformMetadata: account.platformMetadata,
    });

    if (!remoteUrl) {
      return reply.status(404).send({ error: "Avatar not available" });
    }

    const image = await fetchAvatarBytes(remoteUrl, account.platform);
    if (!image) {
      return reply.status(502).send({ error: "Failed to load avatar" });
    }

    return reply
      .header("Content-Type", image.contentType)
      .header("Cache-Control", "private, max-age=3600")
      .send(image.body);
  });

  app.get("/accounts/:id", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());
    const { id: accountId } = request.params as { id: string };

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
          eq(connectedAccounts.userId, userId),
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

    const [account] = await db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, accountId),
          eq(connectedAccounts.userId, userId),
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
    const { POST } = await import("../../connect/refresh-twitter-premium.js");
    const { runNextRouteHandler } = await import("../../lib/run-next-handler.js");
    await runNextRouteHandler(request, reply, POST);
  });
}
