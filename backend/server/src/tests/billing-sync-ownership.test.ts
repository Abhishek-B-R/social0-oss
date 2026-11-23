import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/billing/sync used to bind the first active Dodo subscription whose
 * customer email matched the caller. An account that took over a paying
 * account's old email got that account's plan and subscription id. Sync now
 * binds only subscriptions the caller owns (checkout metadata, email only as a
 * legacy fallback) and only through a compare-and-set that refuses a
 * subscription id another user_settings row already holds.
 */

type Settings = {
  subscriptionId: string | null;
  subscriptionTier: string;
  customerId: string | null;
};
type DodoSub = {
  subscription_id: string;
  product_id: string;
  status: string;
  next_billing_date: string;
  customer: { customer_id: string; email: string };
  metadata: Record<string, string>;
};

const { store, mocks } = vi.hoisted(() => ({
  store: {
    users: new Map<string, string>(),
    settings: new Map<string, Settings>(),
    subs: [] as DodoSub[],
    openSubs: [] as Array<Record<string, unknown>>,
  },
  mocks: {
    setSubscription: vi.fn(),
    backfillBillingIds: vi.fn(),
    claim: vi.fn(),
  },
}));

vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  allPlanProductIds: () => ["prod_starter", "prod_pro"],
  getTierFromProductId: (id: string) =>
    id === "prod_pro" ? "pro" : id === "prod_starter" ? "starter" : "free",
  isActiveTier: (t: string | null | undefined) => !!t && t !== "free",
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: (_col: unknown, val: unknown) => val };
});

vi.mock("dodopayments", () => ({
  default: class {
    subscriptions = {
      list: (q: { product_id: string; status: string }) =>
        (async function* () {
          for (const s of store.subs) {
            if (s.product_id === q.product_id && s.status === q.status) yield s;
          }
        })(),
    };
  },
}));

vi.mock("../db/index.js", () => ({
  db: {
    query: {
      user: {
        findFirst: vi.fn(async ({ where }: { where: string }) =>
          store.users.has(where) ? { email: store.users.get(where) } : undefined,
        ),
      },
      userSettings: {
        findFirst: vi.fn(async ({ where }: { where: string }) => {
          const row = store.settings.get(where);
          return row ? { ...row } : undefined;
        }),
      },
    },
  },
}));

vi.mock("../lib/subscription.js", () => ({
  setSubscription: mocks.setSubscription,
}));

vi.mock("../lib/billing-guards.js", () => ({
  backfillBillingIds: mocks.backfillBillingIds,
  getLatestSubscriptionPayment: vi.fn(async () => ({
    status: "succeeded",
    total_amount: 1900,
  })),
  listOpenDodoSubscriptions: vi.fn(async () => store.openSubs),
}));

vi.mock("../lib/billing-ownership.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/billing-ownership.js")>();
  return { ...actual, claimSubscriptionForUser: mocks.claim };
});

process.env.DODO_PAYMENTS_API_KEY = "dodo_test";
const { syncSubscriptionForUserId } = await import("../lib/billing-sync.js");

function sub(
  id: string,
  opts: {
    email: string;
    customerId?: string;
    product?: string;
    userId?: string;
  },
): DodoSub {
  return {
    subscription_id: id,
    product_id: opts.product ?? "prod_pro",
    status: "active",
    next_billing_date: "2030-01-01T00:00:00Z",
    customer: { customer_id: opts.customerId ?? "cus_1", email: opts.email },
    metadata: opts.userId ? { userId: opts.userId } : {},
  };
}

function setUser(id: string, email: string, settings?: Partial<Settings>) {
  store.users.set(id, email);
  store.settings.set(id, {
    subscriptionId: null,
    subscriptionTier: "free",
    customerId: null,
    ...settings,
  });
}

describe("billing sync ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.users.clear();
    store.settings.clear();
    store.subs = [];
    store.openSubs = [];

    // In-memory stand-in for the SQL compare-and-set: the slot must still hold
    // what the caller read (or the incoming id), and no other row may hold the
    // subscription (or, for email-only bindings, its customer).
    mocks.claim.mockImplementation(
      async (
        userId: string,
        subscriptionId: string,
        expected: string | null,
        opts?: { exclusiveCustomerId?: string | null },
      ) => {
        for (const [otherId, row] of store.settings) {
          if (otherId === userId) continue;
          if (row.subscriptionId === subscriptionId) return false;
          if (
            opts?.exclusiveCustomerId &&
            row.customerId === opts.exclusiveCustomerId
          ) {
            return false;
          }
        }
        const row = store.settings.get(userId)!;
        if (
          row.subscriptionId !== expected &&
          row.subscriptionId !== subscriptionId
        ) {
          return false;
        }
        row.subscriptionId = subscriptionId;
        return true;
      },
    );
    mocks.setSubscription.mockImplementation(
      async (
        userId: string,
        d: { tier: string; subscriptionId: string | null; customerId: string | null },
      ) => {
        const row = store.settings.get(userId)!;
        row.subscriptionTier = d.tier;
        row.subscriptionId = d.subscriptionId;
        row.customerId = d.customerId;
      },
    );
  });

  it("does not hand another account's subscription to a user who took over its email", async () => {
    // A bought Pro as e1, then moved to e2. B registered with e1.
    setUser("user_A", "e2@x.com", {
      subscriptionId: "sub_A",
      subscriptionTier: "pro",
      customerId: "cus_A",
    });
    setUser("user_B", "e1@x.com");
    store.subs = [
      sub("sub_A", { email: "e1@x.com", customerId: "cus_A", userId: "user_A" }),
    ];

    const result = await syncSubscriptionForUserId("user_B");

    expect(result).toEqual({ ok: false });
    expect(mocks.setSubscription).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(store.settings.get("user_B")).toMatchObject({
      subscriptionId: null,
      subscriptionTier: "free",
    });
  });

  it("refuses a legacy (no-metadata) subscription another account already holds", async () => {
    setUser("user_A", "e2@x.com", {
      subscriptionId: "sub_legacy",
      subscriptionTier: "pro",
      customerId: "cus_A",
    });
    setUser("user_B", "e1@x.com");
    store.subs = [sub("sub_legacy", { email: "e1@x.com", customerId: "cus_A" })];

    const result = await syncSubscriptionForUserId("user_B");

    expect(result).toEqual({ ok: false });
    expect(mocks.setSubscription).not.toHaveBeenCalled();
    expect(store.settings.get("user_B")?.subscriptionTier).toBe("free");
  });

  it("refuses a legacy subscription whose Dodo customer belongs to another account", async () => {
    // A's subscription id was cleared (e.g. on_hold) but A keeps the customer.
    setUser("user_A", "e2@x.com", { customerId: "cus_A" });
    setUser("user_B", "e1@x.com");
    store.subs = [sub("sub_legacy", { email: "e1@x.com", customerId: "cus_A" })];

    expect(await syncSubscriptionForUserId("user_B")).toEqual({ ok: false });
    expect(mocks.claim).toHaveBeenCalledWith("user_B", "sub_legacy", null, {
      exclusiveCustomerId: "cus_A",
    });
    expect(mocks.setSubscription).not.toHaveBeenCalled();
  });

  it("still binds a legacy subscription by email when nobody else holds it", async () => {
    setUser("user_B", "e1@x.com");
    store.subs = [sub("sub_legacy", { email: "E1@x.com", customerId: "cus_B" })];

    expect(await syncSubscriptionForUserId("user_B")).toEqual({
      ok: true,
      tier: "pro",
    });
    expect(store.settings.get("user_B")).toMatchObject({
      subscriptionId: "sub_legacy",
      subscriptionTier: "pro",
      customerId: "cus_B",
    });
  });

  it("binds the buyer's own subscription by metadata even after an email change", async () => {
    setUser("user_A", "e2@x.com");
    store.subs = [
      sub("sub_A", { email: "e1@x.com", customerId: "cus_A", userId: "user_A" }),
    ];

    expect(await syncSubscriptionForUserId("user_A")).toEqual({
      ok: true,
      tier: "pro",
    });
    expect(mocks.claim).toHaveBeenCalledWith("user_A", "sub_A", null, {
      exclusiveCustomerId: null,
    });
    expect(store.settings.get("user_A")?.subscriptionId).toBe("sub_A");
  });

  it("keeps a live plan on its canonical subscription instead of the first product listed", async () => {
    setUser("user_A", "a@x.com", {
      subscriptionId: "sub_pro",
      subscriptionTier: "pro",
      customerId: "cus_A",
    });
    store.subs = [
      // prod_starter is listed before prod_pro.
      sub("sub_starter", {
        email: "a@x.com",
        customerId: "cus_A",
        product: "prod_starter",
        userId: "user_A",
      }),
      sub("sub_pro", { email: "a@x.com", customerId: "cus_A", userId: "user_A" }),
    ];

    expect(await syncSubscriptionForUserId("user_A")).toEqual({
      ok: true,
      tier: "pro",
    });
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(store.settings.get("user_A")?.subscriptionId).toBe("sub_pro");
  });

  it("does not backfill another account's open subscription id", async () => {
    setUser("user_B", "e1@x.com");
    store.openSubs = [
      {
        subscriptionId: "sub_A",
        status: "on_hold",
        productId: "prod_pro",
        customerId: "cus_A",
        previousBillingDate: null,
        metadata: { userId: "user_A" },
        customerEmail: "e1@x.com",
      },
    ];

    expect(await syncSubscriptionForUserId("user_B")).toEqual({ ok: false });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.backfillBillingIds).not.toHaveBeenCalled();
    expect(store.settings.get("user_B")?.subscriptionId).toBeNull();
  });

  it("backfills the user's own open subscription through the claim", async () => {
    setUser("user_B", "b@x.com");
    store.openSubs = [
      {
        subscriptionId: "sub_B",
        status: "on_hold",
        productId: "prod_pro",
        customerId: "cus_B",
        previousBillingDate: null,
        metadata: { userId: "user_B" },
        customerEmail: "b@x.com",
      },
    ];

    expect(await syncSubscriptionForUserId("user_B")).toEqual({ ok: false });
    expect(store.settings.get("user_B")?.subscriptionId).toBe("sub_B");
    expect(mocks.backfillBillingIds).toHaveBeenCalledWith("user_B", {
      customerId: "cus_B",
    });
  });
});
