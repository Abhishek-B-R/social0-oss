import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { apiKeys, userWebhookSubscriptions } from "../../db/schema.js";
import { generateApiKey } from "../../lib/api-keys.js";
import { encryptToken } from "@social0/shared";
import { resolveRequestActor, requireUserId } from "../../middleware/auth.js";
import { enforceRateLimit, rpcMutationLimiter } from "../../lib/ratelimit.js";
import { WEBHOOK_EVENTS } from "../../lib/user-webhook-delivery.js";
import { isValidUUID } from "../../lib/validation.js";
import { isAllowedWebhookUrl } from "../../lib/webhook-url.js";
import {
  clampDeliveryLimit,
  listWebhookDeliveriesForUser,
  listWebhooksForUser,
  parseDeliveryCursor,
  testWebhookForUser,
} from "../../services/webhooks.js";
import crypto from "node:crypto";

const SUBSCRIBABLE_EVENTS = new Set<string>(WEBHOOK_EVENTS);

/** Reject unknown event names at create time; they would never fire. */
function invalidEvents(events: string[]): string[] {
  return events.filter((e) => !SUBSCRIBABLE_EVENTS.has(e));
}

/** Keeps one leaked key from becoming an unbounded supply of new ones. */
const MAX_ACTIVE_API_KEYS = 25;
const MAX_WEBHOOK_SUBSCRIPTIONS = 20;
const MAX_API_KEY_NAME_LENGTH = 120;
/** Matches the connector name minted by the MCP OAuth flow. */
const MAX_API_KEY_LIFETIME_MS = 5 * 365 * 24 * 60 * 60 * 1000;

/** ISO timestamp in the future, at most 5 years out. Undefined = never expires. */
function parseApiKeyExpiry(
  raw: unknown,
): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "expiresAt must be an ISO 8601 string" };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "expiresAt must be a valid ISO 8601 datetime" };
  }
  const now = Date.now();
  if (date.getTime() <= now) {
    return { ok: false, error: "expiresAt must be in the future" };
  }
  if (date.getTime() > now + MAX_API_KEY_LIFETIME_MS) {
    return { ok: false, error: "expiresAt must be within the next 5 years" };
  }
  return { ok: true, value: date };
}

async function countActiveApiKeys(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
  return row?.count ?? 0;
}

export async function countWebhookSubscriptions(
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userWebhookSubscriptions)
    .where(eq(userWebhookSubscriptions.userId, userId));
  return row?.count ?? 0;
}

export const WEBHOOK_SUBSCRIPTION_LIMIT = MAX_WEBHOOK_SUBSCRIPTIONS;

/**
 * API keys are credentials: managing them must never be possible *with* an API
 * key, or one leaked key mints replacements that survive revoking it. Reject
 * that source specifically rather than demanding a cookie, so the local
 * `x-user-id` dev header keeps working like the session it stands in for.
 */
async function requireNonApiKeyUserId(
  request: Parameters<typeof resolveRequestActor>[0],
): Promise<string | null> {
  const actor = await resolveRequestActor(request);
  if (!actor || actor.source === "apiKey") return null;
  return actor.userId;
}

export async function registerApiPlatformRoutes(app: FastifyInstance) {
  app.post("/api-keys", async (request, reply) => {
    const userId = await requireNonApiKeyUserId(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const body = request.body as { name?: string; expiresAt?: string | null };
    if (!body?.name?.trim()) {
      return reply.status(400).send({ error: "name required" });
    }

    const expiry = parseApiKeyExpiry(body.expiresAt);
    if (!expiry.ok) {
      return reply.status(400).send({ error: expiry.error });
    }

    if ((await countActiveApiKeys(userId)) >= MAX_ACTIVE_API_KEYS) {
      return reply.status(409).send({
        error: `You can have up to ${MAX_ACTIVE_API_KEYS} active API keys. Revoke one first.`,
      });
    }

    const { raw, hash, prefix } = generateApiKey();
    const row = await db
      .insert(apiKeys)
      .values({
        userId,
        name: body.name.trim().slice(0, MAX_API_KEY_NAME_LENGTH),
        keyHash: hash,
        keyPrefix: prefix,
        expiresAt: expiry.value,
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
    const userId = await requireNonApiKeyUserId(request);
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
    const userId = await requireNonApiKeyUserId(request);
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
    const userId = await requireNonApiKeyUserId(request);
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
    const userId = await requireNonApiKeyUserId(request);
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
    if (!(await isAllowedWebhookUrl(body.url))) {
      return reply.status(400).send({
        error:
          "Webhook URL must be a public https URL that resolves to a public address (no localhost or private networks).",
      });
    }
    if ((await countWebhookSubscriptions(userId)) >= MAX_WEBHOOK_SUBSCRIPTIONS) {
      return reply.status(409).send({
        error: `You can have up to ${MAX_WEBHOOK_SUBSCRIPTIONS} webhook endpoints. Delete one first.`,
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
