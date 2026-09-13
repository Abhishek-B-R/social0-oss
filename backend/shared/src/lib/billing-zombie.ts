import DodoPayments from "dodopayments";
import { eq } from "drizzle-orm";
import { db } from "../db/instance.js";
import { userSettings } from "../db/schema.js";
import { setSubscription } from "./subscription.js";
import { syncConnectedAccountsToLimit } from "./plan-limits.js";

/**
 * Cancelling unpaid ("zombie") Dodo subscriptions.
 *
 * Both the API (at webhook time) and the background worker (daily sweep) need
 * this, and each had its own copy — 192 identical lines that had to be edited
 * twice. The sweep itself stays in the worker; only the parts both callers run
 * live here.
 */

/** Dodo statuses treated as unpaid/zombie. Used by webhooks + background-worker sweep. */
export const ZOMBIE_DODO_STATUSES = ["on_hold", "pending", "failed"] as const;
export type ZombieDodoStatus = (typeof ZOMBIE_DODO_STATUSES)[number];

const DEFAULT_GRACE_DAYS = 15;

export function zombieGraceDays(): number {
  const raw = process.env.DODO_ZOMBIE_SUBSCRIPTION_GRACE_DAYS;
  const n = raw ? Number(raw) : DEFAULT_GRACE_DAYS;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRACE_DAYS;
}

/**
 * Each package's env loader validates this against the same two-value enum at
 * boot, so reading the raw variable here cannot disagree with it.
 */
export function dodoEnvironment(): "test_mode" | "live_mode" {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
    ? "live_mode"
    : "test_mode";
}

export function dodoClient(): DodoPayments | null {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
  if (!apiKey) return null;
  return new DodoPayments({
    bearerToken: apiKey,
    environment: dodoEnvironment(),
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

export function isStaleZombieSubscription(
  sub: ZombieSubscriptionTiming,
): boolean {
  if (!ZOMBIE_DODO_STATUSES.includes(sub.status as ZombieDodoStatus)) {
    return false;
  }
  const graceMs = zombieGraceDays() * 24 * 60 * 60 * 1000;
  const staleSince = zombieStaleSince(sub);
  if (Number.isNaN(staleSince.getTime())) return false;
  return Date.now() - staleSince.getTime() >= graceMs;
}

export function zombieErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

async function patchCancelSubscription(
  client: DodoPayments,
  subscriptionId: string,
  body: Parameters<DodoPayments["subscriptions"]["update"]>[1],
): Promise<void> {
  await client.subscriptions.update(subscriptionId, body);
}

/** Try several Dodo cancel shapes - on_hold subs often reject a bare status patch. */
async function cancelInDodo(
  client: DodoPayments,
  subscriptionId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const metadata = {
    zombie_cleanup: "true",
    cancel_reason: "cancelled_by_merchant",
    cancellation_comment:
      "Automated cancellation of unpaid/zombie subscription",
  };

  const attempts: Array<{ label: string; run: () => Promise<void> }> = [
    {
      label: "immediate_cancel_with_metadata",
      run: () =>
        patchCancelSubscription(client, subscriptionId, {
          status: "cancelled",
          cancel_at_next_billing_date: false,
          metadata,
        }),
    },
    {
      label: "immediate_cancel",
      run: () =>
        patchCancelSubscription(client, subscriptionId, {
          status: "cancelled",
          cancel_at_next_billing_date: false,
        }),
    },
    {
      label: "status_cancelled_only",
      run: () =>
        patchCancelSubscription(client, subscriptionId, {
          status: "cancelled",
        }),
    },
    {
      label: "schedule_then_cancel",
      run: async () => {
        await patchCancelSubscription(client, subscriptionId, {
          cancel_at_next_billing_date: true,
        });
        await patchCancelSubscription(client, subscriptionId, {
          status: "cancelled",
          cancel_at_next_billing_date: false,
        });
      },
    },
  ];

  let lastMessage = "unknown error";
  for (const attempt of attempts) {
    try {
      await attempt.run();
      return { ok: true };
    } catch (e) {
      lastMessage = `${attempt.label}: ${zombieErrorMessage(e)}`;
      console.warn("[billing-zombie] cancel attempt failed:", {
        subscriptionId,
        attempt: attempt.label,
        message: zombieErrorMessage(e),
      });
    }
  }

  return { ok: false, message: lastMessage };
}

/** Dodo terminal states - cannot transition to cancelled via API. */
function isDodoTerminalStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "expired" || status === "cancelled";
}

/** Immediately cancel an unpaid/zombie subscription in Dodo and clear local linkage. */
export async function forceCancelDodoSubscription(
  subscriptionId: string,
): Promise<{ ok: true; terminal?: boolean } | { ok: false; message: string }> {
  const client = dodoClient();
  if (!client)
    return { ok: false, message: "DODO_PAYMENTS_API_KEY not configured" };

  try {
    const sub = await client.subscriptions.retrieve(subscriptionId);
    if (isDodoTerminalStatus(sub.status)) {
      await revertLocalUserForSubscription(subscriptionId);
      return {
        ok: true,
        terminal: sub.status === "failed" || sub.status === "expired",
      };
    }

    const cancelled = await cancelInDodo(client, subscriptionId);
    if (!cancelled.ok) {
      return cancelled;
    }

    await revertLocalUserForSubscription(subscriptionId);
    return { ok: true };
  } catch (e) {
    const msg = zombieErrorMessage(e);
    console.error("[billing-zombie] force cancel failed:", subscriptionId, msg);
    return { ok: false, message: msg };
  }
}
