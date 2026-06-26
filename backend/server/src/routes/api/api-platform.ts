import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { isSafeOutboundUrl } from "@social0/shared";
import { db } from "../../db/index.js";
import { apiKeys, userWebhookSubscriptions } from "../../db/schema.js";
import { generateApiKey } from "../../lib/api-keys.js";
import { requireUserId } from "../../middleware/auth.js";

function isAllowedWebhookUrl(url: string): boolean {
  const httpsOnly = process.env.NODE_ENV === "production";
  return isSafeOutboundUrl(url, { httpsOnly });
}

export async function registerApiPlatformRoutes(app: FastifyInstance) {
  app.post("/api-keys", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const body = request.body as { name?: string };
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
      })
      .returning({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
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
      .where(eq(apiKeys.userId, userId));
    return { keys };
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
      secret?: string;
      events?: string[];
    };
    if (!body.url || !body.secret || !body.events?.length) {
      return reply.status(400).send({ error: "url, secret, events required" });
    }
    if (!isAllowedWebhookUrl(body.url)) {
      return reply.status(400).send({
        error:
          "Webhook URL must be a public https URL (no localhost or private networks).",
      });
    }
    const row = await db
      .insert(userWebhookSubscriptions)
      .values({
        userId,
        url: body.url,
        secret: body.secret,
        events: body.events,
      })
      .returning({
        id: userWebhookSubscriptions.id,
        url: userWebhookSubscriptions.url,
        events: userWebhookSubscriptions.events,
        active: userWebhookSubscriptions.active,
        createdAt: userWebhookSubscriptions.createdAt,
      });
    return { subscription: row[0] };
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
