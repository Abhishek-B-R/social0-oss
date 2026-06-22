import DodoPayments from "dodopayments";
import { db } from "@/db";
import { trialClaims } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PLAN_IDS, isActiveTier } from "@/lib/plans";
import { getSubscriptionForUser } from "@/lib/subscription";
import { env } from "@/lib/env";

export const TRIAL_PERIOD_DAYS = 7;

const BLOCKING_DODO_STATUSES = ["active", "on_hold", "pending"] as const;

export type DodoSubscriptionSummary = {
  subscriptionId: string;
  status: string;
  productId: string;
  customerId: string | null;
  previousBillingDate: string | null;
};

/** Normalize email for trial dedup (Gmail dots/plus aliases). */
export function normalizeBillingEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";

  local = local.split("+")[0] ?? local;
  if (domain === "gmail.com") {
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

function dodoClient(): DodoPayments | null {
  const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
  if (!apiKey) return null;
  return new DodoPayments({
    bearerToken: apiKey,
    environment: env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode",
  });
}

/** Open Dodo subscriptions for this customer/email (active, on_hold, pending). */
export async function listOpenDodoSubscriptions(
  email: string,
  customerId?: string | null,
): Promise<DodoSubscriptionSummary[]> {
  const client = dodoClient();
  if (!client) return [];

  const normalizedEmail = normalizeBillingEmail(email);
  const productIds = [PLAN_IDS.starter, PLAN_IDS.growth, PLAN_IDS.pro].filter(
    Boolean,
  );
  const results: DodoSubscriptionSummary[] = [];
  const seen = new Set<string>();

  for (const status of BLOCKING_DODO_STATUSES) {
    for (const productId of productIds) {
      try {
        for await (const sub of client.subscriptions.list({
          product_id: productId,
          status,
          customer_id: customerId ?? undefined,
          page_size: 100,
        })) {
          if (!customerId) {
            const subEmail = normalizeBillingEmail(sub.customer?.email ?? "");
            if (subEmail !== normalizedEmail) continue;
          }

          const id = sub.subscription_id;
          if (!id || seen.has(id)) continue;
          seen.add(id);

          results.push({
            subscriptionId: id,
            status: sub.status ?? status,
            productId: sub.product_id ?? productId,
            customerId: sub.customer?.customer_id ?? null,
            previousBillingDate: sub.previous_billing_date ?? null,
          });
        }
      } catch {
        // Best-effort — checkout still guarded by DB state if Dodo list fails.
      }
    }
  }

  return results;
}

export type CheckoutEligibility =
  | { allowed: true; trialPeriodDays: number }
  | {
      allowed: false;
      code: "use_change_plan" | "use_portal";
      error: string;
      status: number;
    };

export async function evaluateCheckoutEligibility(
  userId: string,
  email: string,
): Promise<CheckoutEligibility> {
  const sub = await getSubscriptionForUser(userId);
  const normalizedEmail = normalizeBillingEmail(email);

  if (isActiveTier(sub.tier) && sub.subscriptionId) {
    return {
      allowed: false,
      code: "use_change_plan",
      error:
        "You already have an active subscription. Change your plan from billing instead of starting a new checkout.",
      status: 409,
    };
  }

  const openSubs = await listOpenDodoSubscriptions(email, sub.customerId);
  if (openSubs.length > 0) {
    const hasActive = openSubs.some((s) => s.status === "active");
    return {
      allowed: false,
      code: hasActive ? "use_change_plan" : "use_portal",
      error: hasActive
        ? "You already have an active subscription. Manage it from the billing page."
        : "You have an unpaid subscription on file. Update your payment method in the customer portal instead of starting a new checkout.",
      status: 409,
    };
  }

  const trialClaim = await db.query.trialClaims.findFirst({
    where: eq(trialClaims.normalizedEmail, normalizedEmail),
    columns: { normalizedEmail: true },
  });
  const trialUsed = sub.hasUsedTrial || Boolean(trialClaim);

  return {
    allowed: true,
    trialPeriodDays: trialUsed ? 0 : TRIAL_PERIOD_DAYS,
  };
}

export async function hasTrialBeenClaimed(
  email: string,
  userId: string,
): Promise<boolean> {
  const sub = await getSubscriptionForUser(userId);
  if (sub.hasUsedTrial) return true;

  const normalizedEmail = normalizeBillingEmail(email);
  const claim = await db.query.trialClaims.findFirst({
    where: eq(trialClaims.normalizedEmail, normalizedEmail),
    columns: { normalizedEmail: true },
  });
  return Boolean(claim);
}

export async function recordTrialClaim(params: {
  email: string;
  userId: string;
  customerId?: string | null;
}): Promise<void> {
  const normalizedEmail = normalizeBillingEmail(params.email);
  await db
    .insert(trialClaims)
    .values({
      normalizedEmail,
      userId: params.userId,
      customerId: params.customerId ?? null,
    })
    .onConflictDoNothing();
}

type DodoPaymentRow = {
  status?: string;
  total_amount?: number;
  created_at?: string;
  payment_id?: string;
};

/** Latest succeeded payment with amount > 0 within the last window (for upgrade verification). */
export async function findRecentPaidUpgradePayment(
  subscriptionId: string,
  windowMs = 15 * 60 * 1000,
): Promise<DodoPaymentRow | null> {
  const client = dodoClient();
  if (!client) return null;

  const cutoff = Date.now() - windowMs;
  try {
    const list = await (client.payments as { list: (q: object) => Promise<unknown> }).list({
      subscription_id: subscriptionId,
      limit: 10,
    });
    const items = Array.isArray((list as { items?: unknown[] })?.items)
      ? ((list as { items: unknown[] }).items as DodoPaymentRow[])
      : [];

    for (const item of items) {
      if (item.status !== "succeeded") continue;
      const amount = typeof item.total_amount === "number" ? item.total_amount : 0;
      if (amount <= 0) continue;
      const created =
        typeof item.created_at === "string"
          ? Date.parse(item.created_at)
          : NaN;
      if (!Number.isFinite(created) || created < cutoff) continue;
      return item;
    }
  } catch {
    return null;
  }
  return null;
}
