import DodoPayments from "dodopayments";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  AGENCY_INCLUDED_ACCOUNTS,
  AGENCY_MAX_EXTRA_ACCOUNTS,
  agencyExtraAccountsFor,
  allExtraAccountAddonIds,
  extraAccountsFromAddons,
  getExtraAccountAddonId,
  getIntervalFromProductId,
  getTierFromProductId,
  type BillingInterval,
  type PaidPlanTier,
} from "@social0/shared";
import { db } from "../db/index.js";
import { connectedAccounts, userSettings } from "../db/schema.js";
import { env } from "./env.js";

/**
 * Agency bills every connected account above the 59 included, so its add-on
 * quantity follows the connected-account count. A connect or disconnect never
 * waits on Dodo: it queues `syncAgencyExtraAccounts`, and the
 * `agency-extra-accounts` cron reconciles anything that failed.
 *
 * Raising the quantity charges the prorated difference now
 * (`prevent_change` keeps the old quantity when the charge fails, and the cron
 * retries). Lowering it uses `do_not_bill`: no mid-cycle refund, the next bill
 * is simply smaller.
 */

/** Safety backstop on the add-on quantity, not a plan cap. */
export const MAX_EXTRA_ACCOUNTS = AGENCY_MAX_EXTRA_ACCOUNTS;

/**
 * The add-on list to send Dodo for a plan change. Dodo replaces the list on
 * every change (an empty one removes all add-ons), so a non-Agency plan, or
 * Agency with no extras, gets `[]`. Callers check the add-on id is configured
 * before asking for extras.
 */
export function extraAccountAddons(
  plan: PaidPlanTier,
  extraAccounts: number,
  interval: BillingInterval,
): { addon_id: string; quantity: number }[] {
  if (plan !== "agency" || extraAccounts <= 0) return [];
  const addonId = getExtraAccountAddonId(interval);
  return addonId ? [{ addon_id: addonId, quantity: extraAccounts }] : [];
}

/** Active connected accounts the user owns (the count Agency bills on). */
export async function countActiveConnectedAccounts(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, userId),
        eq(connectedAccounts.isActive, true),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Extra accounts an Agency subscription should carry for this user right now.
 * Checkout and plan changes bill this instead of a number the client picks, so
 * nobody prepays for accounts they have not connected.
 */
export async function agencyExtraAccountsForUser(userId: string): Promise<number> {
  // Every account counts, active or not: moving to Agency activates them all.
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, userId));
  return agencyExtraAccountsFor(row?.count ?? 0);
}

export type AgencyExtraSyncResult =
  | { status: "skipped"; reason: string }
  | { status: "unchanged"; quantity: number }
  | { status: "changed"; from: number; to: number }
  | { status: "failed"; reason: string; target?: number };

type DodoClient = Pick<DodoPayments, "subscriptions">;

let dodoClient: DodoClient | null = null;
function getDodo(): DodoClient | null {
  const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
  if (!apiKey) return null;
  dodoClient ??= new DodoPayments({
    bearerToken: apiKey,
    environment: env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode",
  });
  return dodoClient;
}

/** Test hook: swap the Dodo client. */
export function __setDodoClientForTests(client: DodoClient | null): void {
  dodoClient = client;
}

/**
 * Bring the Agency add-on quantity on Dodo in line with the connected-account
 * count. Never throws: billing problems come back as `failed` for the caller to
 * log, and the cron retries them.
 */
export async function syncAgencyExtraAccounts(
  userId: string,
): Promise<AgencyExtraSyncResult> {
  try {
    const row = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
      columns: { subscriptionId: true, subscriptionTier: true, extraAccounts: true },
    });
    if (row?.subscriptionTier !== "agency" || !row.subscriptionId) {
      return { status: "skipped", reason: "not_agency" };
    }
    const client = getDodo();
    if (!client) return { status: "skipped", reason: "billing_not_configured" };

    const target = agencyExtraAccountsFor(await countActiveConnectedAccounts(userId));

    const subscription = await client.subscriptions.retrieve(row.subscriptionId);
    if (subscription.status !== "active") {
      return { status: "skipped", reason: `subscription_${subscription.status}` };
    }
    const productId = subscription.product_id ?? "";
    if (getTierFromProductId(productId) !== "agency") {
      return { status: "skipped", reason: "product_not_agency" };
    }
    if (subscription.scheduled_change) {
      // An immediate change would collide with it; retry after it lands.
      return { status: "failed", reason: "scheduled_change", target };
    }

    const current = extraAccountsFromAddons(subscription.addons);
    if (current === target) {
      if ((row.extraAccounts ?? 0) !== current) {
        // Dodo already matches; a missed webhook left our copy behind.
        await db
          .update(userSettings)
          .set({ extraAccounts: current })
          .where(eq(userSettings.userId, userId));
      }
      return { status: "unchanged", quantity: current };
    }

    const interval = getIntervalFromProductId(productId) ?? "monthly";
    const addonId = getExtraAccountAddonId(interval);
    if (target > 0 && !addonId) {
      return { status: "failed", reason: "addon_not_configured", target };
    }

    // Dodo replaces the whole add-on list: keep any add-on that is not the
    // extra-account one, and set the extra-account one to the new total.
    const extraIds = new Set(allExtraAccountAddonIds());
    const addons = [
      ...(subscription.addons ?? [])
        .filter((a) => !extraIds.has(a.addon_id))
        .map((a) => ({ addon_id: a.addon_id, quantity: a.quantity })),
      ...(target > 0 ? [{ addon_id: addonId, quantity: target }] : []),
    ];

    await client.subscriptions.changePlan(row.subscriptionId, {
      product_id: productId,
      quantity: 1,
      addons,
      // More accounts: charge the prorated difference now. Fewer: no refund,
      // the next bill is smaller.
      proration_billing_mode: target > current ? "prorated_immediately" : "do_not_bill",
      effective_at: "immediately",
      on_payment_failure: "prevent_change",
    });
    // `user_settings.extra_accounts` follows from the subscription webhook.
    return { status: "changed", from: current, to: target };
  } catch (e) {
    return {
      status: "failed",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

const inFlight = new Map<string, Promise<AgencyExtraSyncResult>>();

/**
 * Fire-and-forget sync after a connect or disconnect. Runs one sync per user at
 * a time (a burst of connects ends in one more pass with the final count), and
 * never throws into the caller: a connect must not fail because of billing.
 * Safe only on the API process, which outlives the request.
 */
export function queueAgencyExtraAccountsSync(userId: string, source: string): void {
  const prev = inFlight.get(userId) ?? Promise.resolve(null);
  const next = prev
    .catch(() => null)
    .then(() => syncAgencyExtraAccounts(userId))
    .then((result) => {
      if (result.status === "failed") {
        console.error("[agency-extras] sync failed; the cron will retry", {
          userId,
          source,
          ...result,
        });
      } else if (result.status === "changed") {
        console.log("[agency-extras] quantity changed", { userId, source, ...result });
      }
      return result;
    })
    .catch((e: unknown) => {
      console.error("[agency-extras] sync threw", { userId, source, error: String(e) });
      return { status: "failed", reason: String(e) } as AgencyExtraSyncResult;
    })
    .finally(() => {
      if (inFlight.get(userId) === next) inFlight.delete(userId);
    });
  inFlight.set(userId, next);
}

/** Wait for a queued sync (tests and graceful shutdown). */
export async function waitForAgencyExtraAccountsSync(userId: string): Promise<void> {
  await inFlight.get(userId);
}

/**
 * Cron: re-sync every Agency user whose stored add-on quantity does not match
 * their connected-account count (a failed or skipped sync, a missed webhook).
 */
export async function reconcileAgencyExtraAccounts(): Promise<{
  checked: number;
  changed: number;
  failed: number;
}> {
  const target = sql<number>`least(${AGENCY_MAX_EXTRA_ACCOUNTS}, greatest(count(${connectedAccounts.id})::int - ${AGENCY_INCLUDED_ACCOUNTS}, 0))`;
  const rows = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .leftJoin(
      connectedAccounts,
      and(
        eq(connectedAccounts.userId, userSettings.userId),
        eq(connectedAccounts.isActive, true),
      ),
    )
    .where(
      and(
        eq(userSettings.subscriptionTier, "agency"),
        isNotNull(userSettings.subscriptionId),
      ),
    )
    .groupBy(userSettings.userId, userSettings.extraAccounts)
    .having(sql`${userSettings.extraAccounts} <> ${target}`)
    .limit(200);
  const userIds = rows.map((r: { userId: string }) => r.userId);
  let changed = 0;
  let failed = 0;
  for (const userId of userIds) {
    const result = await syncAgencyExtraAccounts(userId);
    if (result.status === "changed") changed++;
    if (result.status === "failed") {
      failed++;
      console.error("[agency-extras] reconcile failed", { userId, ...result });
    }
  }
  return { checked: userIds.length, changed, failed };
}
