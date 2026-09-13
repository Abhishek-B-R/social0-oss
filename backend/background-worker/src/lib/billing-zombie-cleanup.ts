/**
 * Daily sweep for unpaid ("zombie") Dodo subscriptions.
 *
 * The cancel logic itself is shared with the API — see
 * `@social0/shared/lib/billing-zombie`; only the listing and sweep loop, which
 * nothing else runs, live here.
 */
import type DodoPayments from "dodopayments";
import { allPlanProductIds } from "@social0/shared";
import {
  ZOMBIE_DODO_STATUSES,
  dodoClient,
  dodoEnvironment,
  forceCancelDodoSubscription,
  isStaleZombieSubscription,
  zombieErrorMessage,
  zombieGraceDays,
  type ZombieDodoStatus,
  type ZombieSubscriptionTiming,
} from "@social0/shared/lib/billing-zombie";

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
  /** failed/expired in Dodo - cannot PATCH cancel; local DB cleared only. */
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

function shouldCancelZombie(
  sub: ZombieSubscriptionTiming,
  force: boolean,
): boolean {
  if (force) {
    return ZOMBIE_DODO_STATUSES.includes(sub.status as ZombieDodoStatus);
  }
  return isStaleZombieSubscription(sub);
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
  const productIds = allPlanProductIds();
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
          message: zombieErrorMessage(e),
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

  const { candidates, listErrors } = await collectZombieCandidates(
    client,
    force,
  );
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
