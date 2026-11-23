import { beforeEach, describe, expect, it, vi } from "vitest";

type SettingsRow = {
  subscriptionId: string | null;
  subscriptionTier: string;
};
type LiveSub = {
  subscription_id: string;
  product_id: string;
  status: string;
  next_billing_date: string;
  customer: { customer_id: string; email: string };
  metadata: Record<string, string>;
};

const { store, mocks } = vi.hoisted(() => {
  process.env.DODO_PAYMENTS_AGENCY_EXTRA_ACCOUNT_ADDON_ID = "adn_extra";
  return {
  store: {
    settings: new Map<string, SettingsRow>(),
    /** Subscriptions as Dodo's API returns them now. */
    live: new Map<string, LiveSub>(),
  },
  mocks: {
    retrieve: vi.fn(),
    setSubscription: vi.fn(),
    setIfCanonical: vi.fn(),
    forceCancel: vi.fn(),
    refund: vi.fn(),
    listOpenSubs: vi.fn(),
    release: vi.fn(),
    settleAfterUpgrade: vi.fn(),
  },
  };
});

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() {
  for (let i = 0; i < 10; i += 1) await tick();
}

const TIER_BY_PRODUCT: Record<string, string> = {
  prod_starter: "starter",
  prod_growth: "growth",
  prod_pro: "pro",
  prod_creator: "creator",
  prod_agency: "agency",
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
    subscriptions = { retrieve: mocks.retrieve };
  },
}));
vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  getTierFromProductId: (id: string) => TIER_BY_PRODUCT[id] ?? "free",
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
  setSubscriptionIfCanonical: mocks.setIfCanonical,
}));
vi.mock("../lib/plan-limits.js", () => ({
  syncConnectedAccountsToLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/webhook-idempotency.js", () => ({
  claimWebhookDelivery: vi.fn().mockResolvedValue(true),
  releaseWebhookDelivery: mocks.release,
}));
vi.mock("../lib/billing-guards.js", () => ({
  findRecentPaidUpgradePayment: vi.fn(async () => {
    await tick();
    return { payment_id: "pay_1" };
  }),
  hasTrialBeenClaimed: vi.fn().mockResolvedValue(false),
  listOpenDodoSubscriptions: mocks.listOpenSubs,
  recordTrialClaim: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/billing-refunds.js", () => ({
  refundLatestSubscriptionCharge: mocks.refund,
}));
vi.mock("../lib/pending-checkout.js", () => ({
  clearPendingCheckout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/billing-after-upgrade.js", () => ({
  getAfterUpgradeMarker: vi.fn().mockResolvedValue(null),
  settleAfterUpgrade: mocks.settleAfterUpgrade,
}));
vi.mock("../lib/billing-zombie-utils.js", () => ({
  forceCancelDodoSubscription: mocks.forceCancel,
  isStaleZombieSubscription: () => false,
}));

vi.mock("../db/index.js", () => ({
  db: {
    query: {
      user: {
        findFirst: vi.fn(async () => ({ id: "user_1" })),
      },
      userSettings: {
        findFirst: vi.fn(async () => {
          await tick();
          const row = store.settings.get("user_1");
          return row ? { userId: "user_1", ...row, pendingPlanTier: null } : undefined;
        }),
      },
    },
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));

import { handleDodoWebhook } from "../handlers/webhooks/dodo.js";

let deliveries = 0;
function deliver(type: string, data: Record<string, unknown>) {
  deliveries += 1;
  return handleDodoWebhook(
    new Request("http://localhost/api/webhooks/dodo", {
      method: "POST",
      headers: {
        "webhook-id": `wh_${deliveries}`,
        "webhook-timestamp": "0",
        "webhook-signature": "v1,sig",
      },
      body: JSON.stringify({ type, data }),
    }),
  ) as unknown as Promise<{ status: number; body: unknown }>;
}

function sub(
  subscriptionId: string,
  product = "prod_pro",
  status = "active",
): LiveSub {
  return {
    subscription_id: subscriptionId,
    product_id: product,
    status,
    next_billing_date: "2030-01-01T00:00:00Z",
    customer: { customer_id: "cus_1", email: "buyer@example.com" },
    metadata: { userId: "user_1" },
  };
}

/** Make `s` what Dodo returns now, and return it as an event payload. */
function live(s: LiveSub): LiveSub {
  store.live.set(s.subscription_id, s);
  return s;
}

function row() {
  return store.settings.get("user_1")!;
}

function cancelled(): string[] {
  return mocks.forceCancel.mock.calls.map((c) => c[0] as string);
}

function refunded(): string[] {
  return mocks.refund.mock.calls.map((c) => c[0] as string);
}

describe("dodo webhook subscription handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.settings.clear();
    store.live.clear();
    store.settings.set("user_1", { subscriptionId: null, subscriptionTier: "free" });
    mocks.retrieve.mockImplementation(async (id: string) => {
      await tick();
      const s = store.live.get(id);
      if (!s) throw Object.assign(new Error("not found"), { status: 404 });
      return s;
    });
    mocks.setSubscription.mockImplementation(
      async (userId: string, d: { tier: string; subscriptionId: string | null }) => {
        await tick();
        const r = store.settings.get(userId)!;
        r.subscriptionTier = d.tier;
        r.subscriptionId = d.subscriptionId;
      },
    );
    // Same compare-and-set as the real helper: id and tier land together.
    mocks.setIfCanonical.mockImplementation(
      async (
        userId: string,
        expected: string | null,
        d: { tier: string; subscriptionId: string },
      ) => {
        await tick();
        const r = store.settings.get(userId)!;
        if (r.subscriptionId !== expected && r.subscriptionId !== d.subscriptionId) {
          return false;
        }
        r.subscriptionId = d.subscriptionId;
        r.subscriptionTier = d.tier;
        return true;
      },
    );
    mocks.forceCancel.mockResolvedValue({ ok: true });
    mocks.refund.mockResolvedValue({
      refunded: true,
      paymentId: "pay_x",
      refundId: "ref_x",
    });
    mocks.listOpenSubs.mockResolvedValue([]);
    mocks.release.mockResolvedValue(undefined);
    mocks.settleAfterUpgrade.mockResolvedValue(undefined);
  });

  /**
   * Both activations used to read "no canonical sub", both wrote themselves,
   * and each cancelled the other as a rival: charged twice, left on free.
   */
  it("accepts exactly one of two same-tier subscriptions activating at once", async () => {
    mocks.listOpenSubs.mockResolvedValue([
      { subscriptionId: "sub_A", status: "active", productId: "prod_pro" },
      { subscriptionId: "sub_B", status: "active", productId: "prod_pro" },
    ]);
    await Promise.all([
      deliver("subscription.active", live(sub("sub_A"))),
      deliver("subscription.active", live(sub("sub_B"))),
    ]);
    await settle();

    const winner = row().subscriptionId;
    expect(winner === "sub_A" || winner === "sub_B").toBe(true);
    expect(row().subscriptionTier).toBe("pro");
    const loser = winner === "sub_A" ? "sub_B" : "sub_A";

    expect(cancelled()).toContain(loser);
    expect(cancelled()).not.toContain(winner);
    expect(refunded()).toContain(loser);
    expect(refunded()).not.toContain(winner);
  });

  it("re-delivery of the canonical subscription still applies", async () => {
    store.settings.set("user_1", { subscriptionId: "sub_A", subscriptionTier: "pro" });
    const res = await deliver("subscription.active", live(sub("sub_A")));
    expect(res.status).toBe(200);
    expect(mocks.setIfCanonical).toHaveBeenCalledTimes(1);
    expect(mocks.forceCancel).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  /**
   * Starter opened, then Growth, both paid. The second activation used to be
   * cancelled whatever its tier, and nothing refunded it.
   */
  describe("two paid checkouts", () => {
    it("keeps the higher tier when the lower one activates second, and refunds the lower", async () => {
      store.settings.set("user_1", { subscriptionId: "sub_G", subscriptionTier: "growth" });
      live(sub("sub_G", "prod_growth"));
      await deliver("subscription.active", live(sub("sub_S", "prod_starter")));
      await settle();

      expect(row()).toEqual({ subscriptionId: "sub_G", subscriptionTier: "growth" });
      expect(cancelled()).toEqual(["sub_S"]);
      expect(refunded()).toEqual(["sub_S"]);
    });

    it("moves to the higher tier when it activates second, and refunds the lower", async () => {
      store.settings.set("user_1", { subscriptionId: "sub_S", subscriptionTier: "starter" });
      live(sub("sub_S", "prod_starter"));
      await deliver("subscription.active", live(sub("sub_G", "prod_growth")));
      await settle();

      expect(row()).toEqual({ subscriptionId: "sub_G", subscriptionTier: "growth" });
      expect(cancelled()).toEqual(["sub_S"]);
      expect(refunded()).toEqual(["sub_S"]);
    });

    it("lands on the higher tier when both activate at once, in either order", async () => {
      for (const order of [
        ["sub_S", "sub_G"],
        ["sub_G", "sub_S"],
      ]) {
        vi.clearAllMocks();
        store.settings.set("user_1", { subscriptionId: null, subscriptionTier: "free" });
        live(sub("sub_S", "prod_starter"));
        live(sub("sub_G", "prod_growth"));
        mocks.listOpenSubs.mockResolvedValue([
          { subscriptionId: "sub_S", status: "active", productId: "prod_starter" },
          { subscriptionId: "sub_G", status: "active", productId: "prod_growth" },
        ]);
        await Promise.all(
          order.map((id) => deliver("subscription.active", store.live.get(id)!)),
        );
        await settle();

        expect(row()).toEqual({ subscriptionId: "sub_G", subscriptionTier: "growth" });
        expect(cancelled()).toContain("sub_S");
        expect(cancelled()).not.toContain("sub_G");
        expect(refunded()).toContain("sub_S");
        expect(refunded()).not.toContain("sub_G");
      }
    });

    it("does not refund a duplicate it could not cancel", async () => {
      store.settings.set("user_1", { subscriptionId: "sub_G", subscriptionTier: "growth" });
      mocks.forceCancel.mockResolvedValueOnce({ ok: false, message: "dodo 500" });
      const res = await deliver("subscription.active", live(sub("sub_S", "prod_starter")));
      expect(res.status).toBe(200);
      expect(mocks.refund).not.toHaveBeenCalled();
    });
  });

  /**
   * A failed delivery is retried with its original payload after newer events
   * were applied. The handler must act on the subscription as it is now.
   */
  describe("stale event payloads", () => {
    it("ignores a retried on_hold once the subscription is active again", async () => {
      store.settings.set("user_1", { subscriptionId: "sub_A", subscriptionTier: "pro" });
      live(sub("sub_A", "prod_pro", "active"));
      const res = await deliver(
        "subscription.on_hold",
        sub("sub_A", "prod_pro", "on_hold"),
      );
      expect(res.status).toBe(200);
      expect(mocks.setSubscription).not.toHaveBeenCalled();
      expect(row()).toEqual({ subscriptionId: "sub_A", subscriptionTier: "pro" });
    });

    it("applies on_hold when Dodo still has the subscription on hold", async () => {
      store.settings.set("user_1", { subscriptionId: "sub_A", subscriptionTier: "pro" });
      live(sub("sub_A", "prod_pro", "on_hold"));
      await deliver("subscription.on_hold", sub("sub_A", "prod_pro", "on_hold"));
      expect(row()).toEqual({ subscriptionId: null, subscriptionTier: "free" });
    });

    it("does not re-grant Pro from a retried update after a downgrade to Starter renewed", async () => {
      store.settings.set("user_1", { subscriptionId: "sub_A", subscriptionTier: "starter" });
      live(sub("sub_A", "prod_starter"));
      await deliver("subscription.updated", sub("sub_A", "prod_pro"));
      expect(row()).toEqual({ subscriptionId: "sub_A", subscriptionTier: "starter" });
    });

    it("fails the delivery and releases the claim when Dodo cannot be read", async () => {
      mocks.retrieve.mockRejectedValueOnce(Object.assign(new Error("dodo 503"), { status: 503 }));
      const res = await deliver("subscription.active", live(sub("sub_A")));
      expect(res.status).toBe(500);
      expect(mocks.release).toHaveBeenCalledTimes(1);
      expect(mocks.setIfCanonical).not.toHaveBeenCalled();
    });

    it("acknowledges and skips a subscription Dodo does not know", async () => {
      const res = await deliver("subscription.on_hold", sub("sub_gone", "prod_pro", "on_hold"));
      expect(res.status).toBe(200);
      expect(mocks.setSubscription).not.toHaveBeenCalled();
      expect(mocks.setIfCanonical).not.toHaveBeenCalled();
    });
  });

  it("leaves an active higher-tier rival for its own activation to settle", async () => {
    live(sub("sub_G", "prod_growth"));
    mocks.listOpenSubs.mockResolvedValue([
      { subscriptionId: "sub_S", status: "active", productId: "prod_starter" },
      { subscriptionId: "sub_G", status: "active", productId: "prod_growth" },
      { subscriptionId: "sub_P", status: "pending", productId: "prod_pro" },
    ]);
    await deliver("subscription.active", live(sub("sub_S", "prod_starter")));
    await settle();

    expect(row()).toEqual({ subscriptionId: "sub_S", subscriptionTier: "starter" });
    expect(cancelled()).toEqual(["sub_P"]);
  });

  /**
   * payment.succeeded is often the only event that can unlock an immediate
   * upgrade. A swallowed error acknowledged it and Dodo never retried.
   */
  it("fails payment.succeeded and releases the claim when Dodo retrieve fails", async () => {
    mocks.retrieve.mockRejectedValueOnce(new Error("dodo 503"));
    const res = await deliver("payment.succeeded", {
      subscription_id: "sub_A",
      status: "succeeded",
    });
    expect(res.status).toBe(500);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("fails payment.succeeded and releases the claim when the DB write fails", async () => {
    live(sub("sub_A"));
    mocks.setIfCanonical.mockRejectedValueOnce(new Error("db blip"));
    const res = await deliver("payment.succeeded", {
      subscription_id: "sub_A",
      status: "succeeded",
    });
    expect(res.status).toBe(500);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.settleAfterUpgrade).not.toHaveBeenCalled();
  });

  it("acknowledges payment.succeeded once the tier is synced", async () => {
    live(sub("sub_A"));
    const res = await deliver("payment.succeeded", {
      subscription_id: "sub_A",
      status: "succeeded",
    });
    expect(res.status).toBe(200);
    expect(row()).toEqual({ subscriptionId: "sub_A", subscriptionTier: "pro" });
    expect(mocks.settleAfterUpgrade).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  describe("agency extra accounts", () => {
    function canonicalWrite() {
      return mocks.setIfCanonical.mock.calls.at(-1)?.[2] as
        | { tier: string; extraAccounts?: number }
        | undefined;
    }

    it("writes the extra-account add-on quantity with the Agency tier", async () => {
      const s = {
        ...sub("sub_A", "prod_agency"),
        addons: [
          { addon_id: "adn_extra", quantity: 41 },
          { addon_id: "adn_unrelated", quantity: 7 },
        ],
      };
      const res = await deliver("subscription.active", live(s));
      expect(res.status).toBe(200);
      expect(canonicalWrite()).toMatchObject({ tier: "agency", extraAccounts: 41 });
    });

    it("writes 0 extras for any other tier", async () => {
      const s = {
        ...sub("sub_A", "prod_creator"),
        addons: [{ addon_id: "adn_extra", quantity: 41 }],
      };
      await deliver("subscription.active", live(s));
      expect(canonicalWrite()).toMatchObject({ tier: "creator", extraAccounts: 0 });
    });

    it("needs a paid charge before more extras on the same Agency subscription count", async () => {
      store.settings.set("user_1", {
        subscriptionId: "sub_A",
        subscriptionTier: "agency",
      });
      const guards = await import("../lib/billing-guards.js");
      vi.mocked(guards.findRecentPaidUpgradePayment).mockResolvedValueOnce(null);
      const s = {
        ...sub("sub_A", "prod_agency"),
        addons: [{ addon_id: "adn_extra", quantity: 10 }],
      };
      await deliver("subscription.updated", live(s));
      expect(guards.findRecentPaidUpgradePayment).toHaveBeenCalled();
      expect(mocks.setIfCanonical).not.toHaveBeenCalled();
    });
  });

  describe("grandfathered plans", () => {
    for (const [tier, product] of [
      ["starter", "prod_starter"],
      ["growth", "prod_growth"],
      ["pro", "prod_pro"],
    ] as const) {
      it(`renews ${tier} as ${tier}, with no upgrade check and no extras`, async () => {
        store.settings.set("user_1", {
          subscriptionId: "sub_A",
          subscriptionTier: tier,
        });
        const guards = await import("../lib/billing-guards.js");
        vi.mocked(guards.findRecentPaidUpgradePayment).mockClear();
        for (const event of ["subscription.renewed", "subscription.active", "subscription.updated"]) {
          mocks.setIfCanonical.mockClear();
          const res = await deliver(event, live(sub("sub_A", product)));
          expect(res.status).toBe(200);
          expect(mocks.setIfCanonical.mock.calls.at(-1)?.[2]).toMatchObject({
            tier,
            subscriptionId: "sub_A",
            extraAccounts: 0,
          });
        }
        expect(guards.findRecentPaidUpgradePayment).not.toHaveBeenCalled();
        expect(mocks.forceCancel).not.toHaveBeenCalled();
        expect(mocks.refund).not.toHaveBeenCalled();
      });
    }
  });
});
