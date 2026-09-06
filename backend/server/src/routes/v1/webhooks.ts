import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isSafeOutboundUrl } from "@social0/shared";
import crypto from "node:crypto";
import { db } from "../../db/index.js";
import { userWebhookSubscriptions } from "../../db/schema.js";
import { apiError } from "../../lib/api-errors.js";
import { encryptToken } from "@social0/shared";
import { WEBHOOK_EVENTS } from "../../lib/user-webhook-delivery.js";
import { isValidUUID } from "../../lib/validation.js";
import {
  clampDeliveryLimit,
  getWebhookForUser,
  listWebhookDeliveriesForUser,
  listWebhooksForUser,
  parseDeliveryCursor,
  testWebhookForUser,
  type WebhookDeliveryRecord,
  type WebhookSummary,
} from "../../services/webhooks.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";
import { requireV1MutationBudget } from "../../middleware/v1-live-limits.js";

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  active: z.boolean().optional(),
});

function isAllowedWebhookUrl(url: string): boolean {
  return isSafeOutboundUrl(url, {
    httpsOnly: process.env.NODE_ENV === "production",
  });
}

function toWebhookDto(row: WebhookSummary) {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    active: row.active,
    last_delivery_at: row.lastDeliveryAt,
    last_delivery_status: row.lastDeliveryStatus,
    last_delivery_response_status: row.lastDeliveryResponseStatus,
    last_delivery_error: row.lastDeliveryError,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function toDeliveryDto(row: WebhookDeliveryRecord) {
  return {
    id: row.id,
    delivery_id: row.deliveryId,
    event: row.event,
    url: row.url,
    status: row.status,
    response_status: row.responseStatus,
    attempts: row.attempts,
    duration_ms: row.durationMs,
    error: row.error,
    created_at: row.createdAt,
  };
}

export async function registerWebhooksRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.get("/webhooks", async (request) => {
    const rows = await listWebhooksForUser(v1UserId(request));
    return { data: rows.map(toWebhookDto) };
  });

  app.post("/webhooks", async (request, reply) => {
    const userId = v1UserId(request);
    const body = createWebhookSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "url and events are required."));
    }
    if (!isAllowedWebhookUrl(body.data.url)) {
      return reply
        .status(400)
        .send(
          apiError(
            "validation_error",
            "Webhook URL must be a public https URL.",
          ),
        );
    }

    const secret = crypto.randomBytes(32).toString("base64url");
    const subscriptionId = crypto.randomUUID();

    const [row] = await db
      .insert(userWebhookSubscriptions)
      .values({
        id: subscriptionId,
        userId,
        url: body.data.url,
        secret: encryptToken(secret, subscriptionId),
        events: body.data.events,
      })
      .returning({
        id: userWebhookSubscriptions.id,
        url: userWebhookSubscriptions.url,
        events: userWebhookSubscriptions.events,
        active: userWebhookSubscriptions.active,
        created_at: userWebhookSubscriptions.createdAt,
      });

    return reply.status(201).send({
      ...row,
      secret,
    });
  });

  app.get("/webhooks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isValidUUID(id)) {
      return reply.status(404).send(apiError("not_found", "Webhook not found."));
    }
    const row = await getWebhookForUser(v1UserId(request), id);
    if (!row) {
      return reply.status(404).send(apiError("not_found", "Webhook not found."));
    }
    return toWebhookDto(row);
  });

  /**
   * Delivery attempts for one endpoint, newest first. This is the answer to
   * "did Social0 even try?" — a delivery that was never attempted has no row,
   * one that was rejected records the response code.
   */
  app.get("/webhooks/:id/deliveries", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isValidUUID(id)) {
      return reply.status(404).send(apiError("not_found", "Webhook not found."));
    }
    const query = request.query as { limit?: string; before?: string };
    const limit = clampDeliveryLimit(query.limit);
    const rows = await listWebhookDeliveriesForUser(v1UserId(request), id, {
      limit,
      before: parseDeliveryCursor(query.before),
    });
    if (!rows) {
      return reply.status(404).send(apiError("not_found", "Webhook not found."));
    }
    const next = rows.length === limit ? rows[rows.length - 1] : undefined;
    return {
      data: rows.map(toDeliveryDto),
      next_before: next ? next.createdAt.toISOString() : null,
    };
  });

  /**
   * Send a signed `webhook.test` ping now and report what came back. Behind the
   * per-minute mutation budget: it makes an outbound request per call.
   */
  app.post(
    "/webhooks/:id/test",
    { preHandler: requireV1MutationBudget },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!isValidUUID(id)) {
        return reply
          .status(404)
          .send(apiError("not_found", "Webhook not found."));
      }
      const outcome = await testWebhookForUser(v1UserId(request), id);
      if (!outcome) {
        return reply
          .status(404)
          .send(apiError("not_found", "Webhook not found."));
      }
      return {
        delivery_id: outcome.deliveryId,
        event: outcome.event,
        url: outcome.url,
        status: outcome.status,
        response_status: outcome.responseStatus,
        attempts: outcome.attempts,
        duration_ms: outcome.durationMs,
        error: outcome.error,
      };
    },
  );

  app.patch("/webhooks/:id", async (request, reply) => {
    const userId = v1UserId(request);
    const { id } = request.params as { id: string };
    if (!isValidUUID(id)) {
      return reply.status(404).send(apiError("not_found", "Webhook not found."));
    }
    const body = updateWebhookSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send(apiError("validation_error", "Invalid request body."));
    }
    if (body.data.url && !isAllowedWebhookUrl(body.data.url)) {
      return reply
        .status(400)
        .send(apiError("validation_error", "Invalid webhook URL."));
    }

    const [updated] = await db
      .update(userWebhookSubscriptions)
      .set({
        ...(body.data.url ? { url: body.data.url } : {}),
        ...(body.data.events ? { events: body.data.events } : {}),
        ...(body.data.active !== undefined ? { active: body.data.active } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userWebhookSubscriptions.id, id),
          eq(userWebhookSubscriptions.userId, userId),
        ),
      )
      .returning({
        id: userWebhookSubscriptions.id,
        url: userWebhookSubscriptions.url,
        events: userWebhookSubscriptions.events,
        active: userWebhookSubscriptions.active,
        updated_at: userWebhookSubscriptions.updatedAt,
      });

    if (!updated) {
      return reply.status(404).send(apiError("not_found", "Webhook not found."));
    }
    return updated;
  });

  app.delete("/webhooks/:id", async (request, reply) => {
    const userId = v1UserId(request);
    const { id } = request.params as { id: string };
    if (!isValidUUID(id)) {
      return reply.status(204).send();
    }
    await db
      .delete(userWebhookSubscriptions)
      .where(
        and(
          eq(userWebhookSubscriptions.id, id),
          eq(userWebhookSubscriptions.userId, userId),
        ),
      );
    return reply.status(204).send();
  });
}
