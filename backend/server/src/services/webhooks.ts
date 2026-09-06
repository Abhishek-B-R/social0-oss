import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { userWebhookSubscriptions, webhookDeliveries } from "../db/schema.js";
import {
  sendWebhookTestDelivery,
  type WebhookDeliveryOutcome,
} from "../lib/user-webhook-delivery.js";

/**
 * Webhook read + test cores shared by the dashboard REST routes and `/v1`.
 * Routes own their DTO casing; the logic lives here (same split as
 * `services/analytics.ts` and `services/inbox.ts`).
 */

export const WEBHOOK_DELIVERIES_DEFAULT_LIMIT = 20;
export const WEBHOOK_DELIVERIES_MAX_LIMIT = 100;

export type WebhookSummary = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: string | null;
  lastDeliveryResponseStatus: number | null;
  lastDeliveryError: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type WebhookDeliveryRecord = {
  id: string;
  deliveryId: string;
  event: string;
  url: string;
  status: string;
  responseStatus: number | null;
  attempts: number;
  durationMs: number | null;
  error: string | null;
  createdAt: Date;
};

const summaryColumns = {
  id: userWebhookSubscriptions.id,
  url: userWebhookSubscriptions.url,
  events: userWebhookSubscriptions.events,
  active: userWebhookSubscriptions.active,
  lastDeliveryAt: userWebhookSubscriptions.lastDeliveryAt,
  lastDeliveryStatus: userWebhookSubscriptions.lastDeliveryStatus,
  lastDeliveryResponseStatus:
    userWebhookSubscriptions.lastDeliveryResponseStatus,
  lastDeliveryError: userWebhookSubscriptions.lastDeliveryError,
  createdAt: userWebhookSubscriptions.createdAt,
  updatedAt: userWebhookSubscriptions.updatedAt,
};

export async function listWebhooksForUser(
  userId: string,
): Promise<WebhookSummary[]> {
  return db
    .select(summaryColumns)
    .from(userWebhookSubscriptions)
    .where(eq(userWebhookSubscriptions.userId, userId))
    .orderBy(desc(userWebhookSubscriptions.createdAt));
}

export async function getWebhookForUser(
  userId: string,
  id: string,
): Promise<WebhookSummary | null> {
  const [row] = await db
    .select(summaryColumns)
    .from(userWebhookSubscriptions)
    .where(
      and(
        eq(userWebhookSubscriptions.id, id),
        eq(userWebhookSubscriptions.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function clampDeliveryLimit(raw: unknown): number {
  const parsed =
    typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return WEBHOOK_DELIVERIES_DEFAULT_LIMIT;
  }
  return Math.min(Math.trunc(parsed), WEBHOOK_DELIVERIES_MAX_LIMIT);
}

/** `before` is an ISO timestamp cursor; invalid values page from the newest. */
export function parseDeliveryCursor(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Deliveries for one webhook, newest first. Returns null when the webhook does
 * not exist for this user, so callers can 404 rather than leak an empty list
 * for someone else's id.
 */
export async function listWebhookDeliveriesForUser(
  userId: string,
  webhookId: string,
  options: { limit?: number; before?: Date | null } = {},
): Promise<WebhookDeliveryRecord[] | null> {
  const webhook = await getWebhookForUser(userId, webhookId);
  if (!webhook) return null;

  const limit = clampDeliveryLimit(options.limit);
  const before = options.before ?? null;

  return db
    .select({
      id: webhookDeliveries.id,
      deliveryId: webhookDeliveries.deliveryId,
      event: webhookDeliveries.event,
      url: webhookDeliveries.url,
      status: webhookDeliveries.status,
      responseStatus: webhookDeliveries.responseStatus,
      attempts: webhookDeliveries.attempts,
      durationMs: webhookDeliveries.durationMs,
      error: webhookDeliveries.error,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.subscriptionId, webhookId),
        eq(webhookDeliveries.userId, userId),
        ...(before ? [lt(webhookDeliveries.createdAt, before)] : []),
      ),
    )
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

/**
 * Send a signed `webhook.test` ping to one of the caller's endpoints and
 * return what the endpoint answered. Null when the webhook is not theirs.
 */
export async function testWebhookForUser(
  userId: string,
  webhookId: string,
): Promise<WebhookDeliveryOutcome | null> {
  const [sub] = await db
    .select({
      id: userWebhookSubscriptions.id,
      userId: userWebhookSubscriptions.userId,
      url: userWebhookSubscriptions.url,
      secret: userWebhookSubscriptions.secret,
    })
    .from(userWebhookSubscriptions)
    .where(
      and(
        eq(userWebhookSubscriptions.id, webhookId),
        eq(userWebhookSubscriptions.userId, userId),
      ),
    )
    .limit(1);

  if (!sub) return null;
  return sendWebhookTestDelivery(sub);
}
