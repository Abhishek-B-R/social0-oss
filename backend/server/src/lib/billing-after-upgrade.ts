import type DodoPayments from "dodopayments";
import { db } from "../db/index.js";
import { userSettings, verification } from "../db/schema.js";
import { and, eq, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { redis } from "./redis.js";

/**
 * "Upgrade now" charges asynchronously (`prorated_immediately` +
 * `on_payment_failure: prevent_change`), so the side effects that only make
 * sense once the user has actually moved — lifting a pending cancellation —
 * wait for the charge, and the scheduled plan change that had to be dropped to
 * make room for it is put back if the charge fails.
 *
 * This marker holds that deferred work per subscription between the
 * change-plan request and the payment webhook. It lives in Redis (or the
 * `verification` table when Redis is off, like pending checkouts); an
 * unsettled marker just expires, leaving the cancellation in place.
 */

/** Long enough for a delayed card charge to settle. */
const AFTER_UPGRADE_TTL_SEC = 3 * 24 * 60 * 60;

/** A Dodo scheduled plan change, kept so it can be put back. */
export type ScheduledChangeSnapshot = {
  productId: string;
  quantity: number;
  /** Add-ons on the scheduled change (Agency extra accounts). Absent on older markers. */
  addons?: { addon_id: string; quantity: number }[];
};

export type AfterUpgradeMarker = {
  userId: string;
  /** Product the immediate change moves to; the charge succeeded once the subscription is on it. */
  targetProductId: string;
  /** Lift `cancel_at_next_billing_date` once the charge succeeds. */
  undoCancel: boolean;
  /** Scheduled change dropped for the upgrade: re-schedule it if the charge fails. */
  scheduledChange: ScheduledChangeSnapshot | null;
  createdAt: number;
};

function redisKey(subscriptionId: string): string {
  return `billing:after-upgrade:${subscriptionId}`;
}

function dbIdentifier(subscriptionId: string): string {
  return `billing-after-upgrade:${subscriptionId}`;
}

function parseMarker(raw: unknown): AfterUpgradeMarker | null {
  if (!raw) return null;
  try {
    const data = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<AfterUpgradeMarker>;
    if (
      typeof data.userId !== "string" ||
      typeof data.targetProductId !== "string" ||
      typeof data.undoCancel !== "boolean"
    ) {
      return null;
    }
    const sc = data.scheduledChange;
    return {
      userId: data.userId,
      targetProductId: data.targetProductId,
      undoCancel: data.undoCancel,
      scheduledChange:
        sc && typeof sc.productId === "string" && typeof sc.quantity === "number"
          ? {
              productId: sc.productId,
              quantity: sc.quantity,
              ...(Array.isArray(sc.addons) ? { addons: sc.addons } : {}),
            }
          : null,
      createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    };
  } catch {
    return null;
  }
}

/** Throws when it cannot be stored: the caller must not start the charge then. */
export async function saveAfterUpgradeMarker(
  subscriptionId: string,
  marker: AfterUpgradeMarker,
): Promise<void> {
  const payload = JSON.stringify(marker);
  if (redis) {
    await redis.set(redisKey(subscriptionId), payload, {
      ex: AFTER_UPGRADE_TTL_SEC,
    });
    return;
  }
  const identifier = dbIdentifier(subscriptionId);
  await db.delete(verification).where(eq(verification.identifier, identifier));
  await db.insert(verification).values({
    id: randomUUID(),
    identifier,
    value: payload,
    expiresAt: new Date(Date.now() + AFTER_UPGRADE_TTL_SEC * 1000),
  });
}

export async function getAfterUpgradeMarker(
  subscriptionId: string,
): Promise<AfterUpgradeMarker | null> {
  if (redis) {
    return parseMarker(await redis.get(redisKey(subscriptionId)));
  }
  const row = await db.query.verification.findFirst({
    where: and(
      eq(verification.identifier, dbIdentifier(subscriptionId)),
      gt(verification.expiresAt, new Date()),
    ),
    columns: { value: true },
  });
  return parseMarker(row?.value);
}

export async function clearAfterUpgradeMarker(subscriptionId: string): Promise<void> {
  if (redis) {
    await redis.del(redisKey(subscriptionId));
    return;
  }
  await db
    .delete(verification)
    .where(eq(verification.identifier, dbIdentifier(subscriptionId)));
}

/**
 * Run the deferred work once the upgrade charge has an outcome (payment
 * webhook). `sub` is the subscription as Dodo reports it now.
 *
 * - succeeded and the subscription is on the target product: lift the
 *   cancellation (Dodo + DB) and drop the DB copy of the scheduled change.
 * - failed and the change was prevented: re-schedule the dropped change in
 *   Dodo (the DB still holds `pendingPlanTier`, the cancellation was never
 *   lifted).
 *
 * Anything else (another payment on this subscription, a change still
 * settling) leaves the marker for a later event. Throws on a Dodo error so the
 * webhook is retried; every step is idempotent.
 */
export async function settleAfterUpgrade(
  client: DodoPayments,
  subscriptionId: string,
  sub: { status?: string | null; product_id?: string | null },
  outcome: "succeeded" | "failed",
): Promise<void> {
  const marker = await getAfterUpgradeMarker(subscriptionId);
  if (!marker) return;
  const onTarget = sub.product_id === marker.targetProductId;

  if (outcome === "succeeded") {
    if (!onTarget || sub.status !== "active") return;
    if (marker.undoCancel) {
      await client.subscriptions.update(subscriptionId, {
        cancel_at_next_billing_date: false,
      });
    }
    if (marker.undoCancel || marker.scheduledChange) {
      await db
        .update(userSettings)
        .set({
          ...(marker.undoCancel ? { subscriptionCancelAtPeriodEnd: false } : {}),
          ...(marker.scheduledChange
            ? { pendingPlanTier: null, downgradeReason: null }
            : {}),
        })
        .where(eq(userSettings.userId, marker.userId));
    }
    await clearAfterUpgradeMarker(subscriptionId);
    return;
  }

  if (onTarget) return;
  if (marker.scheduledChange) {
    await rescheduleDroppedChange(client, subscriptionId, marker.scheduledChange);
  }
  await clearAfterUpgradeMarker(subscriptionId);
}

/** Put back a scheduled plan change dropped to make room for an immediate one. */
export async function rescheduleDroppedChange(
  client: DodoPayments,
  subscriptionId: string,
  change: ScheduledChangeSnapshot,
): Promise<void> {
  await client.subscriptions.changePlan(subscriptionId, {
    product_id: change.productId,
    quantity: change.quantity,
    // Omitted add-ons would be dropped from the restored change.
    ...(change.addons?.length ? { addons: change.addons } : {}),
    proration_billing_mode: "do_not_bill",
    effective_at: "next_billing_date",
  });
}
