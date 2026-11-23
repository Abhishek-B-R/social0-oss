import { and, desc, eq, sql } from "drizzle-orm";
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
  /**
   * Opaque keyset cursor for this row. Pass the last row's value back as
   * `before` to get the next (older) page. `createdAt` cannot serve: it is a
   * JS Date, so it drops the microseconds Postgres stores and rows that share
   * the boundary row's millisecond would fall between pages.
   */
  cursor: string;
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

/**
 * Keyset position in the delivery log: rows strictly older than
 * (`createdAt`, `id`) come next. `createdAt` is a UTC wall-clock string at
 * full Postgres precision (`YYYY-MM-DDTHH:MM:SS.ffffff`, no zone), matching
 * the zone-less `webhook_deliveries.created_at` column. `id` is null only for
 * a legacy timestamp cursor.
 */
export type DeliveryCursor = { createdAt: string; id: string | null };

const COMPOSITE_CURSOR_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)Z_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Rejects calendar overflow (`2026-02-31`) that `Date` would roll forward. */
function isRealUtcInstant(wallClock: string): boolean {
  const seconds = wallClock.slice(0, 19);
  const parsed = new Date(`${seconds}Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) === seconds
  );
}

/**
 * Parse `before`. The current format is `<created_at>Z_<id>` as minted by
 * `listWebhookDeliveriesForUser`; a bare ISO timestamp (the old `next_before`
 * shape) is still accepted so existing clients keep paging. Invalid values
 * page from the newest.
 */
export function parseDeliveryCursor(raw: unknown): DeliveryCursor | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();

  const composite = COMPOSITE_CURSOR_RE.exec(value);
  if (composite) {
    const [, createdAt, id] = composite;
    if (!createdAt || !id || !isRealUtcInstant(createdAt)) return null;
    return { createdAt, id: id.toLowerCase() };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return { createdAt: parsed.toISOString().slice(0, -1), id: null };
}

/**
 * Deliveries for one webhook, newest first. Returns null when the webhook does
 * not exist for this user, so callers can 404 rather than leak an empty list
 * for someone else's id.
 *
 * Paged by (created_at, id) so rows created in the same instant are neither
 * skipped nor repeated across a page boundary.
 */
export async function listWebhookDeliveriesForUser(
  userId: string,
  webhookId: string,
  options: { limit?: number; before?: DeliveryCursor | null } = {},
): Promise<WebhookDeliveryRecord[] | null> {
  const webhook = await getWebhookForUser(userId, webhookId);
  if (!webhook) return null;

  const limit = clampDeliveryLimit(options.limit);
  const before = options.before ?? null;
  const createdAtCol = webhookDeliveries.createdAt;
  const idCol = webhookDeliveries.id;

  const rows = await db
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
      // created_at is TIMESTAMP (no zone), so to_char is session-zone free.
      createdAtExact: sql<string>`to_char(${createdAtCol}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
    })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.subscriptionId, webhookId),
        eq(webhookDeliveries.userId, userId),
        ...(before
          ? [
              before.id
                ? sql`(${createdAtCol}, ${idCol}) < (${before.createdAt}::timestamp, ${before.id}::uuid)`
                : sql`${createdAtCol} < ${before.createdAt}::timestamp`,
            ]
          : []),
      ),
    )
    .orderBy(desc(createdAtCol), desc(idCol))
    .limit(limit);

  return rows.map(({ createdAtExact, ...row }) => ({
    ...row,
    cursor: `${createdAtExact}Z_${row.id}`,
  }));
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
