import { db } from "../db/index.js";
import { verification } from "../db/schema.js";
import { and, eq, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { redis } from "./redis.js";

const WEBHOOK_IDEMPOTENCY_TTL_SEC = 86400;

function redisKey(webhookId: string): string {
  return `dodo:wh:${webhookId}`;
}

function dbIdentifier(webhookId: string): string {
  return `dodo-wh-${webhookId}`;
}

/**
 * Returns true if this webhook should be processed (first delivery).
 * Returns false if duplicate (already handled).
 *
 * The claim is taken *before* the handler runs, so a handler that fails must
 * call `releaseWebhookDelivery` — otherwise the provider's retry is answered as
 * a duplicate and the billing event is lost for good.
 */
export async function claimWebhookDelivery(webhookId: string): Promise<boolean> {
  if (redis) {
    const wasSet = await redis.set(redisKey(webhookId), "1", {
      nx: true,
      ex: WEBHOOK_IDEMPOTENCY_TTL_SEC,
    });
    return wasSet !== null;
  }

  const identifier = dbIdentifier(webhookId);
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

/**
 * Hand a claim back when the handler did not complete, so the provider's retry
 * of the same webhook id is processed instead of being swallowed as a
 * duplicate. Best effort: never throws into the webhook response path.
 */
export async function releaseWebhookDelivery(webhookId: string): Promise<void> {
  try {
    if (redis) {
      await redis.del(redisKey(webhookId));
      return;
    }
    await db
      .delete(verification)
      .where(eq(verification.identifier, dbIdentifier(webhookId)));
  } catch (err) {
    console.error(
      "[webhook-idempotency] failed to release claim",
      webhookId,
      err,
    );
  }
}
