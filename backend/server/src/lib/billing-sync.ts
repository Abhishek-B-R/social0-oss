import { db } from "../db/index.js";
import { user, userSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import DodoPayments from "dodopayments";
import {
  getTierFromProductId,
  allPlanProductIds,
  extraAccountsFromAddons,
  isActiveTier,
  type PaidPlanTier,
  type SubscriptionTier,
} from "@social0/shared";
import { setSubscription } from "./subscription.js";
import {
  backfillBillingIds,
  getLatestSubscriptionPayment,
  listOpenDodoSubscriptions,
} from "./billing-guards.js";
import {
  claimSubscriptionForUser,
  subscriptionOwnership,
  type OwnershipInput,
} from "./billing-ownership.js";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";

export type SyncSubscriptionResult = {
  ok: boolean;
  tier?: PaidPlanTier;
};

/**
 * Sync subscription from Dodo Payments for a user (by userId).
 * Used after payment redirect and when connect is blocked with limit 0 so we pick up a new subscription.
 */
export async function syncSubscriptionForUserId(
  userId: string,
): Promise<SyncSubscriptionResult> {
  const productIds = allPlanProductIds();
  if (!apiKey || productIds.length === 0) {
    return { ok: false };
  }

  const userRow = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { email: true },
  });
  const userEmail = (userRow?.email ?? "").trim().toLowerCase();
  if (!userEmail) return { ok: false };

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { subscriptionId: true, subscriptionTier: true },
  });
  const canonicalSubId = settings?.subscriptionId ?? null;
  // One canonical subscription per user, the webhook's rule: while a live
  // plan is backed by a subscription, sync only refreshes that one and never
  // rebinds the user to a second subscription on the same email.
  const hasLivePlan =
    canonicalSubId !== null &&
    isActiveTier((settings?.subscriptionTier ?? "free") as SubscriptionTier);

  /**
   * Bind `subscriptionId` to this user only if the user owns it and no other
   * account holds it (compare-and-set against what we read above).
   */
  const claim = (
    subscriptionId: string,
    sub: OwnershipInput & { customerId: string | null },
  ): Promise<boolean> => {
    const ownership = subscriptionOwnership(sub, userId, userEmail);
    if (!ownership) return Promise.resolve(false);
    return claimSubscriptionForUser(userId, subscriptionId, canonicalSubId, {
      // An email-only match is weak: the account that bought it may have
      // moved off this address. Refuse if any other row holds its customer.
      exclusiveCustomerId: ownership === "email" ? sub.customerId : null,
    });
  };

  const client = new DodoPayments({ bearerToken: apiKey, environment });

  try {
    let sawUnpaidActiveSubscription = false;

    for (const productId of productIds) {
      for await (const sub of client.subscriptions.list({
        product_id: productId,
        status: "active",
        page_size: 100,
      })) {
        const subscriptionId = sub.subscription_id ?? null;
        if (!subscriptionId) continue;
        const owned = {
          metadata: sub.metadata ?? null,
          customerEmail: sub.customer?.email ?? null,
          customerId: sub.customer?.customer_id ?? null,
        };
        // Never bind a subscription another account paid for: checkout
        // metadata decides, and the email is only a fallback without it.
        if (!subscriptionOwnership(owned, userId, userEmail)) continue;
        if (hasLivePlan && subscriptionId !== canonicalSubId) continue;

        const tier = getTierFromProductId(sub.product_id ?? "");
        if (tier === "free") continue;

        // Only sync upgrade when the newest payment has succeeded.
        try {
          const latest = await getLatestSubscriptionPayment(subscriptionId);
          const paymentStatus = latest?.status ?? null;
          if (paymentStatus !== "succeeded") {
            sawUnpaidActiveSubscription = true;
            continue;
          }
          const amount =
            typeof latest?.total_amount === "number"
              ? latest.total_amount
              : 0;
          if (amount <= 0) {
            sawUnpaidActiveSubscription = true;
            continue;
          }
        } catch {
          sawUnpaidActiveSubscription = true;
          continue;
        }

        if (!(await claim(subscriptionId, owned))) {
          console.warn(
            "[billing-sync] Subscription not claimable for this user (held elsewhere or slot moved)",
            { subscriptionId },
          );
          continue;
        }

        // The list response carries no add-ons: read them for Agency, whose
        // account cap depends on them. Left undefined on a failed read, the
        // stored count stays as it was.
        let extraAccounts: number | undefined = 0;
        if (tier === "agency") {
          extraAccounts = await client.subscriptions
            .retrieve(subscriptionId)
            .then((full) => extraAccountsFromAddons(full.addons))
            .catch(() => undefined);
        }

        await setSubscription(userId, {
          tier,
          expiresAt: sub.next_billing_date
            ? new Date(sub.next_billing_date)
            : null,
          subscriptionId,
          customerId: owned.customerId,
          extraAccounts,
        });
        return { ok: true, tier };
      }
    }
    // If we saw an active subscription but its latest payment isn't succeeded yet,
    // don't touch the tier - webhook will update it once payment clears.
    if (!sawUnpaidActiveSubscription) {
      const openSubs = (await listOpenDodoSubscriptions(userEmail)).filter(
        (s) =>
          subscriptionOwnership(s, userId, userEmail) !== null &&
          (!hasLivePlan || s.subscriptionId === canonicalSubId),
      );
      if (openSubs.length > 0) {
        const primary =
          openSubs.find((s) => s.status === "on_hold") ??
          openSubs.find((s) => s.status === "pending") ??
          openSubs[0];
        if (await claim(primary.subscriptionId, primary)) {
          await backfillBillingIds(userId, { customerId: primary.customerId });
        }
      }
      // Client-initiated sync may upgrade tier; never downgrade to free here.
    }
    return { ok: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    console.error("[billing-sync] Dodo sync error:", msg);
    return { ok: false };
  }
}
