import { createHmac, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { isSafeOutboundUrl } from "@social0/shared";
import { db } from "../db/index.js";
import { userWebhookSubscriptions } from "../db/schema.js";
import { decryptToken } from "./encryption.js";
import { fetchWithTimeout } from "./fetch-with-timeout.js";

export const WEBHOOK_EVENTS = [
  "post.published",
  "post.failed",
  "post.scheduled",
  "post.deleted",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type WebhookPayload = {
  id: string;
  type: WebhookEvent;
  created_at: string;
  data: Record<string, unknown>;
};

function signWebhookPayload(
  secret: string,
  timestamp: number,
  body: string,
): string {
  // Keep in sync with @social0/shared user-webhook-signature.ts
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

async function deliverOne(
  url: string,
  secret: string,
  payload: WebhookPayload,
): Promise<void> {
  if (!isSafeOutboundUrl(url, { httpsOnly: process.env.NODE_ENV === "production" })) {
    return;
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(secret, timestamp, body);

  await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Social0-Webhooks/1.0",
      "X-Social0-Signature": `t=${timestamp},v1=${signature}`,
      "X-Social0-Event": payload.type,
      "X-Social0-Delivery-Id": payload.id,
    },
    body,
    timeoutMs: 15_000,
  });
}

/** Fire-and-forget webhook delivery to all matching subscriptions. */
export function emitUserWebhookEvent(
  userId: string,
  type: WebhookEvent,
  data: Record<string, unknown>,
): void {
  void deliverUserWebhookEvent(userId, type, data).catch((err) => {
    console.warn("[webhook] delivery error:", err);
  });
}

export async function deliverUserWebhookEvent(
  userId: string,
  type: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const subs = await db
    .select()
    .from(userWebhookSubscriptions)
    .where(
      and(
        eq(userWebhookSubscriptions.userId, userId),
        eq(userWebhookSubscriptions.active, true),
      ),
    );

  const matching = subs.filter((s) => s.events.includes(type));
  if (matching.length === 0) return;

  const payload: WebhookPayload = {
    id: randomUUID(),
    type,
    created_at: new Date().toISOString(),
    data,
  };

  await Promise.allSettled(
    matching.map(async (sub) => {
      const secret = decryptToken(sub.secret, sub.id);
      await deliverOne(sub.url, secret, payload);
    }),
  );
}
