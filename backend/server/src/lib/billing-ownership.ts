import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { userSettings } from "../db/schema.js";
import { isUniqueViolation } from "./pg-errors.js";

export const SUBSCRIPTION_ID_UNIQUE = "user_settings_subscription_id_unique";

/**
 * How a Dodo subscription is tied to a Social0 account.
 *
 * - `metadata`: checkout stamped this user's id on it. The only strong proof.
 * - `email`: no checkout metadata (legacy subscriptions), but the customer
 *   email matches. Weak: an email can move between accounts (change-email,
 *   then a new sign-up reusing the old address), so a binding made this way
 *   must also prove no other account already holds the subscription or its
 *   Dodo customer.
 */
export type SubscriptionOwnership = "metadata" | "email";

export type OwnershipInput = {
  metadata?: Record<string, unknown> | null;
  customerEmail?: string | null;
};

function metadataUserId(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const id = metadata?.userId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Whether `userId` may claim this subscription, and on what grounds. A
 * subscription whose metadata names another user never belongs to this one,
 * whatever its email says.
 */
export function subscriptionOwnership(
  sub: OwnershipInput,
  userId: string,
  userEmail: string,
): SubscriptionOwnership | null {
  const owner = metadataUserId(sub.metadata);
  if (owner) return owner === userId ? "metadata" : null;

  const email = (sub.customerEmail ?? "").trim().toLowerCase();
  const mine = userEmail.trim().toLowerCase();
  return email && email === mine ? "email" : null;
}

/**
 * Compare-and-set the user's canonical subscription id, with the same rule the
 * Dodo webhook uses: it moves to `subscriptionId` only when the row still holds
 * `expectedSubId` (what the caller read) or already holds `subscriptionId`.
 *
 * On top of that, a subscription id can sit on one user_settings row only: the
 * write is refused when any other row holds it. For an email-only binding,
 * pass `exclusiveCustomerId` to also refuse when another row holds that Dodo
 * customer, since that account is the one the email used to belong to.
 *
 * Creates the settings row (column defaults) when missing. Returns false when
 * the slot moved underneath the caller or another account owns the
 * subscription.
 */
export async function claimSubscriptionForUser(
  userId: string,
  subscriptionId: string,
  expectedSubId: string | null,
  opts?: { exclusiveCustomerId?: string | null },
): Promise<boolean> {
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();

  const stillExpected =
    expectedSubId === null
      ? isNull(userSettings.subscriptionId)
      : eq(userSettings.subscriptionId, expectedSubId);

  const customerId = opts?.exclusiveCustomerId ?? null;
  const heldElsewhere = customerId
    ? sql`exists (select 1 from "user_settings" as other where other."user_id" <> ${userId} and (other."subscription_id" = ${subscriptionId} or other."customer_id" = ${customerId}))`
    : sql`exists (select 1 from "user_settings" as other where other."user_id" <> ${userId} and other."subscription_id" = ${subscriptionId})`;

  try {
    const rows = await db
      .update(userSettings)
      .set({ subscriptionId })
      .where(
        and(
          eq(userSettings.userId, userId),
          or(stillExpected, eq(userSettings.subscriptionId, subscriptionId)),
          sql`not ${heldElsewhere}`,
        ),
      )
      .returning({ userId: userSettings.userId });
    return rows.length > 0;
  } catch (err) {
    // Another user claimed it in the same instant: the NOT EXISTS above
    // cannot see an uncommitted row, the unique index can.
    if (isUniqueViolation(err, SUBSCRIPTION_ID_UNIQUE)) return false;
    throw err;
  }
}
