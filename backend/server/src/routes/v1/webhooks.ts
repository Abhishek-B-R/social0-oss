import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { isSafeOutboundUrl } from "@social0/shared";
import crypto from "node:crypto";
import { db } from "../../db/index.js";
import { userWebhookSubscriptions } from "../../db/schema.js";
import { apiError } from "../../lib/api-errors.js";
import { encryptToken } from "../../lib/encryption.js";
import { WEBHOOK_EVENTS } from "../../lib/user-webhook-delivery.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";

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

export async function registerWebhooksRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.get("/webhooks", async (request) => {
    const userId = v1UserId(request);
    const subs = await db
      .select({
        id: userWebhookSubscriptions.id,
        url: userWebhookSubscriptions.url,
        events: userWebhookSubscriptions.events,
        active: userWebhookSubscriptions.active,
        created_at: userWebhookSubscriptions.createdAt,
        updated_at: userWebhookSubscriptions.updatedAt,
      })
      .from(userWebhookSubscriptions)
      .where(eq(userWebhookSubscriptions.userId, userId))
      .orderBy(desc(userWebhookSubscriptions.createdAt));
    return { data: subs };
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

  app.patch("/webhooks/:id", async (request, reply) => {
    const userId = v1UserId(request);
    const { id } = request.params as { id: string };
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
