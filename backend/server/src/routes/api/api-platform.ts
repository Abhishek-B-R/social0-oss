import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { isSafeOutboundUrl } from "@social0/shared";
import { db } from "../../db/index.js";
import { apiKeys, userWebhookSubscriptions } from "../../db/schema.js";
import { generateApiKey } from "../../lib/api-keys.js";
import { encryptToken } from "@social0/shared";
import { requireUserId } from "../../middleware/auth.js";
import crypto from "node:crypto";

function isAllowedWebhookUrl(url: string): boolean {
  const httpsOnly = process.env.NODE_ENV === "production";
  return isSafeOutboundUrl(url, { httpsOnly });
}

export async function registerApiPlatformRoutes(app: FastifyInstance) {
  app.post("/api-keys", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const body = request.body as { name?: string; expiresAt?: string | null };
    if (!body?.name?.trim()) {
      return reply.status(400).send({ error: "name required" });
    }
    const { raw, hash, prefix } = generateApiKey();
    const row = await db
      .insert(apiKeys)
      .values({
        userId,
        name: body.name.trim(),
        keyHash: hash,
        keyPrefix: prefix,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      });
    return { key: raw, apiKey: row[0] };
  });

  app.get("/api-keys", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt));
    return { keys };
  });

  app.patch("/api-keys/:id", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string };
    if (!body?.name?.trim()) {
      return reply.status(400).send({ error: "name required" });
    }
    const [row] = await db
      .update(apiKeys)
      .set({ name: body.name.trim() })
      .where(
        and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)),
      )
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      });
    if (!row) return reply.status(404).send({ error: "API key not found" });
    return { apiKey: row };
  });

  app.post("/api-keys/:id/regenerate", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const { id } = request.params as { id: string };
    const [existing] = await db
      .select({ id: apiKeys.id, name: apiKeys.name })
      .from(apiKeys)
      .where(
        and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)),
      )
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "API key not found" });

    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id));

    const { raw, hash, prefix } = generateApiKey();
    const [row] = await db
      .insert(apiKeys)
      .values({
        userId,
        name: existing.name,
        keyHash: hash,
        keyPrefix: prefix,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        createdAt: apiKeys.createdAt,
      });
    return { key: raw, apiKey: row };
  });

  app.delete("/api-keys/:id", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const { id } = request.params as { id: string };
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
    return { ok: true };
  });

  app.post("/webhooks/subscriptions", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const body = request.body as {
      url?: string;
      events?: string[];
    };
    if (!body.url || !body.events?.length) {
      return reply.status(400).send({ error: "url and events required" });
    }
    if (!isAllowedWebhookUrl(body.url)) {
      return reply.status(400).send({
        error:
          "Webhook URL must be a public https URL (no localhost or private networks).",
      });
    }
    const secret = crypto.randomBytes(32).toString("base64url");
    const subscriptionId = crypto.randomUUID();
    const row = await db
      .insert(userWebhookSubscriptions)
      .values({
        id: subscriptionId,
        userId,
        url: body.url,
        secret: encryptToken(secret, subscriptionId),
        events: body.events,
      })
      .returning({
        id: userWebhookSubscriptions.id,
        url: userWebhookSubscriptions.url,
        events: userWebhookSubscriptions.events,
        active: userWebhookSubscriptions.active,
        createdAt: userWebhookSubscriptions.createdAt,
      });
    return { subscription: row[0], secret };
  });

  app.delete("/webhooks/subscriptions/:id", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const { id } = request.params as { id: string };
    await db
      .delete(userWebhookSubscriptions)
      .where(
        and(eq(userWebhookSubscriptions.id, id), eq(userWebhookSubscriptions.userId, userId)),
      );
    return { ok: true };
  });

  app.get("/webhooks/subscriptions", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const subs = await db
      .select({
        id: userWebhookSubscriptions.id,
        url: userWebhookSubscriptions.url,
        events: userWebhookSubscriptions.events,
        active: userWebhookSubscriptions.active,
        createdAt: userWebhookSubscriptions.createdAt,
        updatedAt: userWebhookSubscriptions.updatedAt,
      })
      .from(userWebhookSubscriptions)
      .where(eq(userWebhookSubscriptions.userId, userId));
    return { subscriptions: subs };
  });
}
