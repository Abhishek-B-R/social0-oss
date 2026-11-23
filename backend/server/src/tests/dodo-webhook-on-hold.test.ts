import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * subscription.on_hold is Dodo's "the renewal charge failed, dunning has
 * started" event. The user should drop to free while the subscription stays
 * alive in Dodo, so updating the card in the portal recovers it. It used to
 * cancel the subscription outright whenever the stored subscription id was
 * not this one, including when it was simply null.
 */

type SettingsRow = { subscriptionId: string | null; subscriptionTier: string };

const { store, mocks } = vi.hoisted(() => ({
  store: {
    settings: new Map<string, SettingsRow>(),
    /** Subscriptions as Dodo's API returns them now (the handler re-reads). */
    live: new Map<string, Record<string, unknown>>(),
  },
  mocks: {
    setSubscription: vi.fn(),
    forceCancel: vi.fn(),
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ col: col.name, val }),
  };
});
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
    subscriptions = {
      retrieve: async (id: string) => {
        const sub = store.live.get(id);
        if (!sub) throw Object.assign(new Error("not found"), { status: 404 });
        return sub;
      },
    };
  },
}));
vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  getTierFromProductId: (id: string) => (id === "prod_pro" ? "pro" : "free"),
  getProductId: () => null,
  getIntervalFromProductId: () => "monthly",
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
  setSubscription: mocks.setSubscription,
}));
vi.mock("../lib/plan-limits.js", () => ({
  syncConnectedAccountsToLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/webhook-idempotency.js", () => ({
  claimWebhookDelivery: vi.fn().mockResolvedValue(true),
  releaseWebhookDelivery: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/billing-guards.js", () => ({
  findRecentPaidUpgradePayment: vi.fn(),
  hasTrialBeenClaimed: vi.fn(),
  listOpenDodoSubscriptions: vi.fn().mockResolvedValue([]),
  recordTrialClaim: vi.fn(),
}));
vi.mock("../lib/pending-checkout.js", () => ({
  clearPendingCheckout: vi.fn(),
}));
vi.mock("../lib/billing-refunds.js", () => ({
  refundLatestSubscriptionCharge: vi.fn(),
}));
vi.mock("../lib/billing-after-upgrade.js", () => ({
  getAfterUpgradeMarker: vi.fn().mockResolvedValue(null),
  settleAfterUpgrade: vi.fn(),
}));
vi.mock("../lib/billing-zombie-utils.js", () => ({
  forceCancelDodoSubscription: mocks.forceCancel,
  isStaleZombieSubscription: () => false,
}));

type Where = { col: string; val: unknown };

vi.mock("../db/index.js", () => ({
  db: {
    query: {
      user: {
        findFirst: vi.fn(async ({ where }: { where: Where }) => {
          if (where.col === "id") return where.val === "user_1" ? { id: "user_1" } : undefined;
          if (where.col === "email") {
            return where.val === "buyer@example.com" ? { id: "user_1" } : undefined;
          }
          return undefined;
        }),
      },
      userSettings: {
        findFirst: vi.fn(async ({ where }: { where: Where }) => {
          for (const [userId, row] of store.settings) {
            if (where.col === "user_id" && where.val === userId) return { userId, ...row };
            if (where.col === "subscription_id" && row.subscriptionId === where.val) {
              return { userId, ...row };
            }
          }
          return undefined;
        }),
      },
    },
  },
}));

import { handleDodoWebhook } from "../handlers/webhooks/dodo.js";

let deliveries = 0;
function deliverOnHold(subscriptionId: string, metadata?: Record<string, string>) {
  deliveries += 1;
  const data = {
    subscription_id: subscriptionId,
    product_id: "prod_pro",
    status: "on_hold",
    customer: { customer_id: "cus_1", email: "buyer@example.com" },
    ...(metadata ? { metadata } : {}),
  };
  store.live.set(subscriptionId, data);
  return handleDodoWebhook(
    new Request("http://localhost/api/webhooks/dodo", {
      method: "POST",
      headers: {
        "webhook-id": `wh_hold_${deliveries}`,
        "webhook-timestamp": "0",
        "webhook-signature": "v1,sig",
      },
      body: JSON.stringify({ type: "subscription.on_hold", data }),
    }),
  ) as unknown as Promise<{ status: number; body: unknown }>;
}

function setRow(row: SettingsRow) {
  store.settings.set("user_1", row);
}

describe("dodo subscription.on_hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.settings.clear();
    store.live.clear();
    mocks.setSubscription.mockResolvedValue(undefined);
    mocks.forceCancel.mockResolvedValue({ ok: true });
  });

  it("reverts the canonical subscription's owner to free and keeps the sub in Dodo", async () => {
    setRow({ subscriptionId: "sub_A", subscriptionTier: "pro" });
    const res = await deliverOnHold("sub_A");
    expect(res.status).toBe(200);
    expect(mocks.setSubscription).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ tier: "free" }),
    );
    expect(mocks.forceCancel).not.toHaveBeenCalled();
  });

  it("does not cancel the user's own subscription when no id is stored", async () => {
    // e.g. a re-delivered on_hold after the first one cleared the id, or a
    // first checkout whose charge failed before it ever activated.
    setRow({ subscriptionId: null, subscriptionTier: "free" });
    await deliverOnHold("sub_A", { userId: "user_1" });
    expect(mocks.forceCancel).not.toHaveBeenCalled();
    expect(mocks.setSubscription).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ tier: "free" }),
    );
  });

  it("does not cancel it when the email is the only link to the user", async () => {
    setRow({ subscriptionId: null, subscriptionTier: "pro" });
    await deliverOnHold("sub_A");
    expect(mocks.forceCancel).not.toHaveBeenCalled();
    expect(mocks.setSubscription).toHaveBeenCalledTimes(1);
  });

  it("does not treat a lapsed (free) row's old id as a live rival", async () => {
    setRow({ subscriptionId: "sub_old", subscriptionTier: "free" });
    await deliverOnHold("sub_A", { userId: "user_1" });
    expect(mocks.forceCancel).not.toHaveBeenCalled();
  });

  it("still cancels a rival when a live plan is backed by a different subscription", async () => {
    setRow({ subscriptionId: "sub_live", subscriptionTier: "pro" });
    await deliverOnHold("sub_rival", { userId: "user_1" });
    expect(mocks.forceCancel).toHaveBeenCalledWith("sub_rival");
    expect(mocks.setSubscription).not.toHaveBeenCalled();
  });

  it("ignores a subscription that belongs to no known user", async () => {
    deliveries += 1;
    store.live.set("sub_X", {
      subscription_id: "sub_X",
      status: "on_hold",
      customer: { customer_id: "cus_9", email: "stranger@example.com" },
    });
    const res = (await handleDodoWebhook(
      new Request("http://localhost/api/webhooks/dodo", {
        method: "POST",
        headers: {
          "webhook-id": `wh_hold_${deliveries}`,
          "webhook-timestamp": "0",
          "webhook-signature": "v1,sig",
        },
        body: JSON.stringify({
          type: "subscription.on_hold",
          data: {
            subscription_id: "sub_X",
            status: "on_hold",
            customer: { customer_id: "cus_9", email: "stranger@example.com" },
          },
        }),
      }),
    )) as unknown as { status: number };
    expect(res.status).toBe(200);
    expect(mocks.forceCancel).not.toHaveBeenCalled();
    expect(mocks.setSubscription).not.toHaveBeenCalled();
  });
});
