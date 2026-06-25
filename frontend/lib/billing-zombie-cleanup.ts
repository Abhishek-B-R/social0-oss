import DodoPayments from "dodopayments";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PLAN_IDS } from "@/lib/plans";
import { env } from "@/lib/env";
import { setSubscription } from "@/lib/subscription";
import { syncConnectedAccountsToLimit } from "@/lib/plan-limits";

export const ZOMBIE_DODO_STATUSES = ["on_hold", "pending", "failed"] as const;
export type ZombieDodoStatus = (typeof ZOMBIE_DODO_STATUSES)[number];

const DEFAULT_GRACE_DAYS = 15;

export type ZombieSweepOptions = {
  /** Cancel all on_hold/pending/failed subs immediately (skip grace period). */
  force?: boolean;
};

export type ZombieSweepFailure = {
  subscriptionId: string;
  status: string;
  message: string;
};

export type ZombieSweepResult = {
  ok: boolean;
  scanned: number;
  /** Cancelled in Dodo via API. */
  cancelled: number;
  /** failed/expired in Dodo — cannot PATCH cancel; local DB cleared only. */
  clearedTerminal: number;
  /** Failed Dodo cancel attempts (after retries). */
  cancelErrors: number;
  /** Failed subscription list API calls. */
  listErrors: number;
  /** @deprecated Use cancelErrors + listErrors */
  errors: number;
  graceDays: number;
  force: boolean;
  environment: "test_mode" | "live_mode";
  error?: string;
  failed?: ZombieSweepFailure[];
};

export function zombieGraceDays(): number {
  const raw = process.env.DODO_ZOMBIE_SUBSCRIPTION_GRACE_DAYS;
  const n = raw ? Number(raw) : DEFAULT_GRACE_DAYS;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRACE_DAYS;
}

function dodoEnvironment(): "test_mode" | "live_mode" {
  return env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";
}

function dodoClient(): DodoPayments | null {
  const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
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

export function isStaleZombieSubscription(sub: ZombieSubscriptionTiming): boolean {
  if (!ZOMBIE_DODO_STATUSES.includes(sub.status as ZombieDodoStatus)) {
    return false;
  }
  const graceMs = zombieGraceDays() * 24 * 60 * 60 * 1000;
  const staleSince = zombieStaleSince(sub);
  if (Number.isNaN(staleSince.getTime())) return false;
  return Date.now() - staleSince.getTime() >= graceMs;
}

function shouldCancelZombie(
  sub: ZombieSubscriptionTiming,
  force: boolean,
): boolean {
  if (force) {
    return ZOMBIE_DODO_STATUSES.includes(sub.status as ZombieDodoStatus);
  }
  return isStaleZombieSubscription(sub);
}

function errorMessage(error: unknown): string {
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

/** Try several Dodo cancel shapes — on_hold subs often reject a bare status patch. */
async function cancelInDodo(
  client: DodoPayments,
  subscriptionId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const metadata = {
    zombie_cleanup: "true",
    cancel_reason: "cancelled_by_merchant",
    cancellation_comment: "Automated cancellation of unpaid/zombie subscription",
  };

  const attempts: Array<{
    label: string;
    run: () => Promise<void>;
  }> = [
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
      lastMessage = `${attempt.label}: ${errorMessage(e)}`;
      console.warn("[billing-zombie] cancel attempt failed:", {
        subscriptionId,
        attempt: attempt.label,
        message: errorMessage(e),
      });
    }
  }

  return { ok: false, message: lastMessage };
}

/** Dodo terminal states — cannot transition to cancelled via API. */
function isDodoTerminalStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "expired" || status === "cancelled";
}

/** Immediately cancel an unpaid/zombie subscription in Dodo and clear local linkage. */
export async function forceCancelDodoSubscription(
  subscriptionId: string,
): Promise<{ ok: true; terminal?: boolean } | { ok: false; message: string }> {
  const client = dodoClient();
  if (!client) return { ok: false, message: "DODO_PAYMENTS_API_KEY not configured" };

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
    const msg = errorMessage(e);
    console.error("[billing-zombie] force cancel failed:", subscriptionId, msg);
    return { ok: false, message: msg };
  }
}

type ZombieCandidate = {
  subscriptionId: string;
  status: string;
  timing: ZombieSubscriptionTiming;
};

async function collectZombieCandidates(
  client: DodoPayments,
  force: boolean,
): Promise<{ candidates: ZombieCandidate[]; listErrors: number }> {
  const productIds = [PLAN_IDS.starter, PLAN_IDS.growth, PLAN_IDS.pro].filter(
    Boolean,
  );
  const candidates: ZombieCandidate[] = [];
  const seen = new Set<string>();
  let listErrors = 0;

  for (const status of ZOMBIE_DODO_STATUSES) {
    const queries =
      productIds.length > 0
        ? [
            ...productIds.map((product_id) => ({
              product_id,
              status,
              page_size: 100,
            })),
            { status, page_size: 100 },
          ]
        : [{ status, page_size: 100 }];

    for (const query of queries) {
      try {
        for await (const sub of client.subscriptions.list(query)) {
          const id = sub.subscription_id;
          if (!id || seen.has(id)) continue;
          seen.add(id);

          const timing: ZombieSubscriptionTiming = {
            status: sub.status ?? status,
            created_at: sub.created_at,
            previous_billing_date: sub.previous_billing_date,
            next_billing_date: sub.next_billing_date,
          };
          if (!shouldCancelZombie(timing, force)) continue;

          candidates.push({
            subscriptionId: id,
            status: timing.status,
            timing,
          });
        }
      } catch (e) {
        listErrors++;
        console.error("[billing-zombie] list failed:", {
          query,
          message: errorMessage(e),
        });
      }
    }
  }

  return { candidates, listErrors };
}

export async function sweepStaleZombieSubscriptions(
  options: ZombieSweepOptions = {},
): Promise<ZombieSweepResult> {
  const force = options.force === true;
  const graceDays = zombieGraceDays();
  const environment = dodoEnvironment();
  const client = dodoClient();
  if (!client) {
    return {
      ok: false,
      scanned: 0,
      cancelled: 0,
      clearedTerminal: 0,
      cancelErrors: 0,
      listErrors: 0,
      errors: 0,
      graceDays,
      force,
      environment,
      error: "DODO_PAYMENTS_API_KEY not configured",
    };
  }

  const { candidates, listErrors } = await collectZombieCandidates(client, force);
  const scanned = candidates.length;
  let cancelled = 0;
  let clearedTerminal = 0;
  const failed: ZombieSweepFailure[] = [];

  for (const candidate of candidates) {
    const result = await forceCancelDodoSubscription(candidate.subscriptionId);
    if (result.ok) {
      if (result.terminal) {
        clearedTerminal++;
        console.log("[billing-zombie] cleared terminal subscription", {
          subscriptionId: candidate.subscriptionId,
          status: candidate.status,
          graceDays,
          force,
          environment,
        });
      } else {
        cancelled++;
        console.log("[billing-zombie] cancelled subscription", {
          subscriptionId: candidate.subscriptionId,
          status: candidate.status,
          graceDays,
          force,
          environment,
        });
      }
      continue;
    }
    failed.push({
      subscriptionId: candidate.subscriptionId,
      status: candidate.status,
      message: result.message,
    });
  }

  // One retry pass for subs that failed the first time (transient Dodo errors).
  const retryQueue = [...failed];
  failed.length = 0;
  for (const item of retryQueue) {
    const result = await forceCancelDodoSubscription(item.subscriptionId);
    if (result.ok) {
      if (result.terminal) {
        clearedTerminal++;
      } else {
        cancelled++;
      }
      console.log("[billing-zombie] cleared on retry", {
        subscriptionId: item.subscriptionId,
        status: item.status,
        terminal: result.terminal ?? false,
      });
      continue;
    }
    failed.push({
      subscriptionId: item.subscriptionId,
      status: item.status,
      message: result.message,
    });
  }

  const cancelErrors = failed.length;
  return {
    ok: true,
    scanned,
    cancelled,
    clearedTerminal,
    cancelErrors,
    listErrors,
    errors: cancelErrors + listErrors,
    graceDays,
    force,
    environment,
    ...(failed.length > 0 ? { failed } : {}),
  };
}
