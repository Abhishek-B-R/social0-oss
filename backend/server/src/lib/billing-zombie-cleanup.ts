import DodoPayments from "dodopayments";
import { db } from "../db/index.js";
import { userSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { PLAN_IDS } from "./plans.js";
import { env } from "./env.js";
import { setSubscription } from "./subscription.js";
import { syncConnectedAccountsToLimit } from "./plan-limits.js";

export const ZOMBIE_DODO_STATUSES = ["on_hold", "pending", "failed"] as const;
export type ZombieDodoStatus = (typeof ZOMBIE_DODO_STATUSES)[number];

const DEFAULT_GRACE_DAYS = 15;

export function zombieGraceDays(): number {
  const raw = process.env.DODO_ZOMBIE_SUBSCRIPTION_GRACE_DAYS;
  const n = raw ? Number(raw) : DEFAULT_GRACE_DAYS;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRACE_DAYS;
}

function dodoClient(): DodoPayments | null {
  const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
  if (!apiKey) return null;
  return new DodoPayments({
    bearerToken: apiKey,
    environment: env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode",
  });
}

export type ZombieSubscriptionTiming = {
  status: string;
  created_at: string;
  previous_billing_date?: string | null;
  next_billing_date?: string | null;
};

/** When the unpaid/zombie period started (for grace-period comparison). */
export function zombieStaleSince(sub: ZombieSubscriptionTiming): Date {
  const neverPaid =
    !sub.previous_billing_date || sub.previous_billing_date === "";
  if (neverPaid || sub.status === "pending" || sub.status === "failed") {
    return new Date(sub.created_at);
  }
  if (sub.next_billing_date) {
    return new Date(sub.next_billing_date);
  }
  return new Date(sub.created_at);
}

export function isStaleZombieSubscription(sub: ZombieSubscriptionTiming): boolean {
  if (!ZOMBIE_DODO_STATUSES.includes(sub.status as ZombieDodoStatus)) {
    return false;
  }
  const graceMs = zombieGraceDays() * 24 * 60 * 60 * 1000;
  const staleSince = zombieStaleSince(sub);
  if (Number.isNaN(staleSince.getTime())) return false;
  return Date.now() - staleSince.getTime() >= graceMs;
}

export async function revertLocalUserForSubscription(
  subscriptionId: string,
): Promise<void> {
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.subscriptionId, subscriptionId),
    columns: { userId: true },
  });
  if (!row) return;

  await setSubscription(row.userId, {
    tier: "free",
    expiresAt: null,
    subscriptionId: null,
    customerId: null,
  });
  await syncConnectedAccountsToLimit(row.userId).catch((e) =>
    console.error("[billing-zombie] syncConnectedAccountsToLimit failed:", e),
  );
}

/** Immediately cancel an unpaid/zombie subscription in Dodo and clear local linkage. */
export async function forceCancelDodoSubscription(
  subscriptionId: string,
): Promise<boolean> {
  const client = dodoClient();
  if (!client) return false;

  try {
    const sub = await client.subscriptions.retrieve(subscriptionId);
    if (sub.status === "cancelled" || sub.status === "expired") {
      await revertLocalUserForSubscription(subscriptionId);
      return true;
    }

    await client.subscriptions.update(subscriptionId, {
      status: "cancelled",
      cancel_at_next_billing_date: false,
      cancel_reason: "cancelled_by_merchant",
      cancellation_comment:
        "Automated cancellation of unpaid/zombie subscription",
      cancellation_feedback: "unused",
    });
    await revertLocalUserForSubscription(subscriptionId);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[billing-zombie] force cancel failed:", subscriptionId, msg);
    return false;
  }
}

export async function sweepStaleZombieSubscriptions(): Promise<{
  scanned: number;
  cancelled: number;
  errors: number;
  graceDays: number;
}> {
  const client = dodoClient();
  const graceDays = zombieGraceDays();
  if (!client) {
    return { scanned: 0, cancelled: 0, errors: 0, graceDays };
  }

  const productIds = [PLAN_IDS.starter, PLAN_IDS.growth, PLAN_IDS.pro].filter(
    Boolean,
  );
  let scanned = 0;
  let cancelled = 0;
  let errors = 0;
  const seen = new Set<string>();

  for (const status of ZOMBIE_DODO_STATUSES) {
    for (const productId of productIds) {
      try {
        for await (const sub of client.subscriptions.list({
          product_id: productId,
          status,
          page_size: 100,
        })) {
          const id = sub.subscription_id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          scanned++;

          if (!isStaleZombieSubscription(sub)) continue;

          const ok = await forceCancelDodoSubscription(id);
          if (ok) {
            cancelled++;
            console.log("[billing-zombie] cancelled stale subscription", {
              subscriptionId: id,
              status: sub.status,
              graceDays,
            });
          } else {
            errors++;
          }
        }
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[billing-zombie] list failed:", { status, productId, msg });
      }
    }
  }

  return { scanned, cancelled, errors, graceDays };
}
