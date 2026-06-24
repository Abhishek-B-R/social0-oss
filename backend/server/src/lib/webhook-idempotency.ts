import { db } from "../db/index.js";
import { verification } from "../db/schema.js";
import { and, eq, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { redis } from "./redis.js";

const WEBHOOK_IDEMPOTENCY_TTL_SEC = 86400;

/**
 * Returns true if this webhook should be processed (first delivery).
 * Returns false if duplicate (already handled).
 */
export async function claimWebhookDelivery(webhookId: string): Promise<boolean> {
  if (redis) {
    const idempotencyKey = `dodo:wh:${webhookId}`;
    const wasSet = await redis.set(idempotencyKey, "1", {
      nx: true,
      ex: WEBHOOK_IDEMPOTENCY_TTL_SEC,
    });
    return wasSet !== null;
  }

  const identifier = `dodo-wh-${webhookId}`;
  const existing = await db.query.verification.findFirst({
    where: and(
      eq(verification.identifier, identifier),
      gt(verification.expiresAt, new Date()),
    ),
    columns: { id: true },
  });
  if (existing) return false;

  await db.insert(verification).values({
    id: randomUUID(),
    identifier,
    value: "1",
    expiresAt: new Date(Date.now() + WEBHOOK_IDEMPOTENCY_TTL_SEC * 1000),
  });
  return true;
}
