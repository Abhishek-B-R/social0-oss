import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * subscription.renewed used to "apply" any DB pending tier that differed from
 * the renewed product with changePlan(do_not_bill, immediately). A pending
 * tier left over from an earlier subscription therefore moved the current one
 * for free: schedule Max on Starter sub A, let A lapse, buy Starter again (sub
 * B), and B's first renewal, charged at the Starter price, became Max.
 */

type Row = {
  userId: string;
  subscriptionId: string | null;
  subscriptionTier: string;
  pendingPlanTier: string | null;
};

const { state, mocks } = vi.hoisted(() => ({
  state: {
    row: null as Row | null,
    live: null as Record<string, unknown> | null,
    updates: [] as Record<string, unknown>[],
  },
  mocks: {
    retrieve: vi.fn(),
    changePlan: vi.fn(),
    setIfCanonical: vi.fn(),
  },
}));

const TIER_BY_PRODUCT: Record<string, string> = {
  prod_starter: "starter",
  prod_growth: "growth",
  prod_pro: "pro",
  prod_max: "max",
};

vi.mock("../lib/env.js", () => ({
  env: {
    DODO_PAYMENTS_WEBHOOK_SECRET: "whsec_test",
    DODO_PAYMENTS_API_KEY: "dodo_test",
    DODO_PAYMENTS_ENVIRONMENT: "test_mode",
  },
}));
vi.mock("standardwebhooks", () => ({
  Webhook: class {
    verify(body: string) {
      return JSON.parse(body);
    }
  },
}));
vi.mock("dodopayments", () => ({
  default: class {
    subscriptions = { retrieve: mocks.retrieve, changePlan: mocks.changePlan };
  },
}));
vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  getTierFromProductId: (id: string) => TIER_BY_PRODUCT[id] ?? "free",
  PLAN_IDS: {},
  isActiveTier: (t: string | null | undefined) => !!t && t !== "free",
}));
vi.mock("../lib/http/http.js", () => ({
  RouteResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("../lib/subscription.js", () => ({
  setSubscription: vi.fn(),
  setSubscriptionIfCanonical: mocks.setIfCanonical,
}));
vi.mock("../lib/plan-limits.js", () => ({
  syncConnectedAccountsToLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/webhook-idempotency.js", () => ({
  claimWebhookDelivery: vi.fn().mockResolvedValue(true),
  releaseWebhookDelivery: vi.fn(),
}));
vi.mock("../lib/billing-guards.js", () => ({
  findRecentPaidUpgradePayment: vi.fn().mockResolvedValue({ payment_id: "p" }),
  hasTrialBeenClaimed: vi.fn().mockResolvedValue(false),
  listOpenDodoSubscriptions: vi.fn().mockResolvedValue([]),
  recordTrialClaim: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/billing-refunds.js", () => ({
  refundLatestSubscriptionCharge: vi.fn(),
}));
vi.mock("../lib/pending-checkout.js", () => ({
  clearPendingCheckout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/billing-after-upgrade.js", () => ({
  getAfterUpgradeMarker: vi.fn().mockResolvedValue(null),
  settleAfterUpgrade: vi.fn(),
}));
vi.mock("../lib/billing-zombie-utils.js", () => ({
  forceCancelDodoSubscription: vi.fn(),
  isStaleZombieSubscription: () => false,
}));
vi.mock("../db/index.js", () => ({
  db: {
    query: {
      user: { findFirst: vi.fn(async () => ({ id: "user_1" })) },
      userSettings: { findFirst: vi.fn(async () => state.row ?? undefined) },
    },
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(patch);
          if (state.row) Object.assign(state.row, patch);
        },
      }),
    }),
  },
}));

import { handleDodoWebhook } from "../handlers/webhooks/dodo.js";

let deliveries = 0;
async function deliverRenewed(subscriptionId: string) {
  deliveries += 1;
  return handleDodoWebhook(
    new Request("http://localhost/api/webhooks/dodo", {
      method: "POST",
      headers: {
        "webhook-id": `wh_renew_${deliveries}`,
        "webhook-timestamp": "0",
        "webhook-signature": "v1,sig",
      },
      body: JSON.stringify({
        type: "subscription.renewed",
        data: { subscription_id: subscriptionId },
      }),
    }),
  ) as unknown as Promise<{ status: number }>;
}

function liveSub(product: string, scheduledProduct?: string) {
  state.live = {
    subscription_id: "sub_B",
    product_id: product,
    status: "active",
    next_billing_date: "2030-02-01T00:00:00Z",
    customer: { customer_id: "cus_1", email: "buyer@example.com" },
    metadata: { userId: "user_1" },
    scheduled_change: scheduledProduct
      ? { product_id: scheduledProduct, quantity: 1 }
      : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.updates.length = 0;
  mocks.retrieve.mockImplementation(async () => state.live);
  mocks.setIfCanonical.mockResolvedValue(true);
});

describe("subscription.renewed with a pending plan tier", () => {
  it("never moves the subscription to a leftover pending tier, and clears it", async () => {
    // pending 'max' was scheduled on sub A, which lapsed; sub B is Starter.
    state.row = {
      userId: "user_1",
      subscriptionId: "sub_B",
      subscriptionTier: "starter",
      pendingPlanTier: "max",
    };
    liveSub("prod_starter");

    const res = await deliverRenewed("sub_B");

    expect(res.status).toBe(200);
    expect(mocks.changePlan).not.toHaveBeenCalled();
    expect(state.row.pendingPlanTier).toBeNull();
    // The plan written is the one Dodo renewed, not the pending one.
    expect(mocks.setIfCanonical).toHaveBeenCalledWith(
      "user_1",
      "sub_B",
      expect.objectContaining({ tier: "starter" }),
    );
  });

  it("does not apply a leftover downgrade either", async () => {
    state.row = {
      userId: "user_1",
      subscriptionId: "sub_B",
      subscriptionTier: "pro",
      pendingPlanTier: "growth",
    };
    liveSub("prod_pro");

    await deliverRenewed("sub_B");

    expect(mocks.changePlan).not.toHaveBeenCalled();
    expect(state.row.pendingPlanTier).toBeNull();
  });

  it("keeps the pending tier while Dodo still has that change scheduled", async () => {
    state.row = {
      userId: "user_1",
      subscriptionId: "sub_B",
      subscriptionTier: "pro",
      pendingPlanTier: "growth",
    };
    liveSub("prod_pro", "prod_growth");

    await deliverRenewed("sub_B");

    expect(mocks.changePlan).not.toHaveBeenCalled();
    expect(state.row.pendingPlanTier).toBe("growth");
  });

  it("clears the pending tier once Dodo applied it at renewal", async () => {
    state.row = {
      userId: "user_1",
      subscriptionId: "sub_B",
      subscriptionTier: "pro",
      pendingPlanTier: "growth",
    };
    liveSub("prod_growth");

    await deliverRenewed("sub_B");

    expect(mocks.changePlan).not.toHaveBeenCalled();
    expect(state.updates).toContainEqual({
      pendingPlanTier: null,
      downgradeReason: null,
    });
    expect(state.row.pendingPlanTier).toBeNull();
  });
});
