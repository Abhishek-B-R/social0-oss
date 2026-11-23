import { isActiveTier, type SubscriptionTier } from "@social0/shared";
import { hasSubscriptionLapsed } from "@social0/shared/lib/subscription";

/** The `user_settings` columns the plan decision reads. */
export type SubscriptionRow = {
  subscriptionTier: string | null;
  subscriptionExpiresAt: Date | null;
  subscriptionCancelAtPeriodEnd: boolean | null;
};

/**
 * The plan a user is on right now, by the rule `getSubscriptionForUser` uses.
 *
 * `subscriptionExpiresAt` is Dodo's next_billing_date, when the renewal is
 * attempted, not when access ends. A paid plan therefore stands past it until
 * `hasSubscriptionLapsed` says otherwise (renewal webhook overdue, or the user
 * cancelled at period end). Reading it as a hard expiry skipped every paying
 * subscriber's crons from their billing date until the renewal webhook landed,
 * while the API kept treating them as paid.
 *
 * Read-only, unlike `getSubscriptionForUser`: the crons batch this over many
 * users and leave the downgrade write to the API's own read path.
 */
export function effectiveTier(
  row: SubscriptionRow,
  now: Date = new Date(),
): SubscriptionTier {
  const tier = (row.subscriptionTier ?? "free") as SubscriptionTier;
  if (!isActiveTier(tier)) return "free";
  if (
    row.subscriptionExpiresAt &&
    hasSubscriptionLapsed(
      row.subscriptionExpiresAt,
      Boolean(row.subscriptionCancelAtPeriodEnd),
      now,
    )
  ) {
    return "free";
  }
  return tier;
}
