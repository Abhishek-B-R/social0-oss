import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { isSafeOutboundUrl } from "@social0/shared";
import { db } from "../../db/index.js";
import { apiKeys, userWebhookSubscriptions } from "../../db/schema.js";
import { generateApiKey } from "../../lib/api-keys.js";
import { encryptToken } from "@social0/shared";
import { requireUserId } from "../../middleware/auth.js";
import { enforceRateLimit, rpcMutationLimiter } from "../../lib/ratelimit.js";
import { WEBHOOK_EVENTS } from "../../lib/user-webhook-delivery.js";
import { isValidUUID } from "../../lib/validation.js";
import {
  clampDeliveryLimit,
  listWebhookDeliveriesForUser,
  listWebhooksForUser,
  parseDeliveryCursor,
  testWebhookForUser,
} from "../../services/webhooks.js";
import crypto from "node:crypto";

function isAllowedWebhookUrl(url: string): boolean {
  const httpsOnly = process.env.NODE_ENV === "production";
  return isSafeOutboundUrl(url, { httpsOnly });
}

const SUBSCRIBABLE_EVENTS = new Set<string>(WEBHOOK_EVENTS);

/** Reject unknown event names at create time; they would never fire. */
function invalidEvents(events: string[]): string[] {
  return events.filter((e) => !SUBSCRIBABLE_EVENTS.has(e));
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
    const unknown = invalidEvents(body.events);
    if (unknown.length > 0) {
      return reply.status(400).send({
        error: `Unknown event${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Supported: ${WEBHOOK_EVENTS.join(", ")}`,
      });
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
    if (!isValidUUID(id)) return { ok: true };
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
    return { subscriptions: await listWebhooksForUser(userId) };
  });

  /** Delivery attempts for one endpoint, newest first. */
  app.get("/webhooks/subscriptions/:id/deliveries", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const { id } = request.params as { id: string };
    if (!isValidUUID(id)) {
      return reply.status(404).send({ error: "Webhook not found" });
    }
    const query = request.query as { limit?: string; before?: string };
    const deliveries = await listWebhookDeliveriesForUser(userId, id, {
      limit: clampDeliveryLimit(query.limit),
      before: parseDeliveryCursor(query.before),
    });
    if (!deliveries) {
      return reply.status(404).send({ error: "Webhook not found" });
    }
    return { deliveries };
  });

  /**
   * Send a signed test delivery now and report the response code. Rate limited
   * because every call makes an outbound request to a user-supplied URL.
   */
  app.post("/webhooks/subscriptions/:id/test", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const { id } = request.params as { id: string };
    if (!isValidUUID(id)) {
      return reply.status(404).send({ error: "Webhook not found" });
    }

    const rate = await enforceRateLimit(
      rpcMutationLimiter,
      `webhook-test:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const outcome = await testWebhookForUser(userId, id);
    if (!outcome) {
      return reply.status(404).send({ error: "Webhook not found" });
    }
    return { delivery: outcome };
  });
}
