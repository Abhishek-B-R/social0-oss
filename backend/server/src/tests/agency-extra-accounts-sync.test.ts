import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Agency never blocks a connect. Every account above the 59 included is added
 * to the Dodo add-on quantity, and a disconnect lowers it again (never below
 * 0, no mid-cycle refund). Billing failures never reach the connect.
 */

const { state, mockDb, dodo } = vi.hoisted(() => {
  process.env.DODO_PAYMENTS_AGENCY_PRODUCT_ID = "prod_agency";
  process.env.DODO_PAYMENTS_AGENCY_YEARLY_PRODUCT_ID = "prod_agency_year";
  process.env.DODO_PAYMENTS_AGENCY_EXTRA_ACCOUNT_ADDON_ID = "adn_extra_month";
  process.env.DODO_PAYMENTS_AGENCY_EXTRA_ACCOUNT_YEARLY_ADDON_ID = "adn_extra_year";
  const state = {
    activeAccounts: 0,
    tier: "agency" as string,
    storedExtras: 0,
    updates: [] as Record<string, unknown>[],
  };
  const selectChain = {
    from: () => selectChain,
    where: async () => [{ count: state.activeAccounts }],
  };
  return {
    state,
    mockDb: {
      query: {
        userSettings: {
          findFirst: vi.fn(async () => ({
            subscriptionId: "sub_1",
            subscriptionTier: state.tier,
            extraAccounts: state.storedExtras,
          })),
        },
      },
      select: vi.fn(() => selectChain),
      update: vi.fn(() => ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(patch);
          },
        }),
      })),
    },
    dodo: {
      retrieve: vi.fn(),
      changePlan: vi.fn(),
    },
  };
});

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@social0/shared/db/instance", () => ({ db: mockDb }));
vi.mock("../lib/env.js", () => ({
  env: { DODO_PAYMENTS_API_KEY: "key", DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
}));
vi.mock("@social0/shared/lib/subscription", () => ({
  getSubscriptionForUser: vi.fn(async () => ({
    tier: state.tier,
    hasUsedTrial: true,
    extraAccounts: state.storedExtras,
  })),
}));

import {
  __setDodoClientForTests,
  queueAgencyExtraAccountsSync,
  syncAgencyExtraAccounts,
  waitForAgencyExtraAccountsSync,
} from "../lib/extra-accounts.js";
import { checkAccountLimits } from "@social0/shared/lib/plan-limits";

/** Dodo subscription currently carrying `quantity` extra accounts. */
function dodoHas(quantity: number, productId = "prod_agency") {
  dodo.retrieve.mockResolvedValue({
    status: "active",
    product_id: productId,
    scheduled_change: null,
    addons:
      quantity > 0
        ? [
            { addon_id: productId === "prod_agency" ? "adn_extra_month" : "adn_extra_year", quantity },
            { addon_id: "adn_other", quantity: 1 },
          ]
        : [{ addon_id: "adn_other", quantity: 1 }],
  });
}

beforeEach(() => {
  state.activeAccounts = 0;
  state.tier = "agency";
  state.storedExtras = 0;
  state.updates = [];
  dodo.retrieve.mockReset();
  dodo.changePlan.mockReset();
  dodo.changePlan.mockResolvedValue({});
  __setDodoClientForTests({
    subscriptions: dodo,
  } as unknown as Parameters<typeof __setDodoClientForTests>[0]);
});

describe("Agency connect never blocks", () => {
  it.each([58, 59, 60, 61])(
    "allows a connect with %i accounts already connected",
    async (current) => {
      state.activeAccounts = current;
      const res = await checkAccountLimits("user_1", "linkedin");
      expect(res.allowed).toBe(true);
      expect(res.includedTotal).toBe(59);
      expect(res.autoBilled).toBe(true);
    },
  );

  it("still caps Creator at 15 and Free at 3", async () => {
    state.tier = "creator";
    state.activeAccounts = 15;
    expect((await checkAccountLimits("user_1", "linkedin")).allowed).toBe(false);
    state.tier = "free";
    state.activeAccounts = 3;
    expect((await checkAccountLimits("user_1", "linkedin")).allowed).toBe(false);
  });

  it("keeps old plans' caps", async () => {
    state.tier = "pro";
    state.activeAccounts = 50;
    const res = await checkAccountLimits("user_1", "linkedin");
    expect(res.allowed).toBe(false);
    expect(res.autoBilled).toBeUndefined();
  });
});

describe("syncAgencyExtraAccounts after a connect", () => {
  it("bills nothing at 59 accounts", async () => {
    state.activeAccounts = 59;
    dodoHas(0);
    expect(await syncAgencyExtraAccounts("user_1")).toEqual({
      status: "unchanged",
      quantity: 0,
    });
    expect(dodo.changePlan).not.toHaveBeenCalled();
  });

  it("adds 1 extra at 60 accounts, charged pro rata now", async () => {
    state.activeAccounts = 60;
    dodoHas(0);
    expect(await syncAgencyExtraAccounts("user_1")).toEqual({
      status: "changed",
      from: 0,
      to: 1,
    });
    expect(dodo.changePlan).toHaveBeenCalledWith("sub_1", {
      product_id: "prod_agency",
      quantity: 1,
      addons: [
        { addon_id: "adn_other", quantity: 1 },
        { addon_id: "adn_extra_month", quantity: 1 },
      ],
      proration_billing_mode: "prorated_immediately",
      effective_at: "immediately",
      on_payment_failure: "prevent_change",
    });
  });

  it("goes to 2 extras at 61 accounts", async () => {
    state.activeAccounts = 61;
    dodoHas(1);
    expect(await syncAgencyExtraAccounts("user_1")).toEqual({
      status: "changed",
      from: 1,
      to: 2,
    });
    const args = dodo.changePlan.mock.calls[0][1];
    expect(args.addons).toContainEqual({ addon_id: "adn_extra_month", quantity: 2 });
    expect(args.proration_billing_mode).toBe("prorated_immediately");
  });

  it("uses the yearly add-on on a yearly Agency plan", async () => {
    state.activeAccounts = 60;
    dodoHas(0, "prod_agency_year");
    await syncAgencyExtraAccounts("user_1");
    const args = dodo.changePlan.mock.calls[0][1];
    expect(args.product_id).toBe("prod_agency_year");
    expect(args.addons).toContainEqual({ addon_id: "adn_extra_year", quantity: 1 });
  });
});

describe("syncAgencyExtraAccounts after a disconnect", () => {
  it("lowers the quantity without a mid-cycle refund", async () => {
    state.activeAccounts = 60; // was 61
    dodoHas(2);
    expect(await syncAgencyExtraAccounts("user_1")).toEqual({
      status: "changed",
      from: 2,
      to: 1,
    });
    const args = dodo.changePlan.mock.calls[0][1];
    expect(args.addons).toContainEqual({ addon_id: "adn_extra_month", quantity: 1 });
    expect(args.proration_billing_mode).toBe("do_not_bill");
  });

  it("drops the add-on entirely at 59 and never goes below 0", async () => {
    state.activeAccounts = 40;
    dodoHas(1);
    await syncAgencyExtraAccounts("user_1");
    const args = dodo.changePlan.mock.calls[0][1];
    expect(args.addons).toEqual([{ addon_id: "adn_other", quantity: 1 }]);
    expect(args.proration_billing_mode).toBe("do_not_bill");
  });
});

describe("billing never breaks a connect", () => {
  it("returns failed instead of throwing when Dodo errors", async () => {
    state.activeAccounts = 61;
    dodoHas(0);
    dodo.changePlan.mockRejectedValue(new Error("card declined"));
    expect(await syncAgencyExtraAccounts("user_1")).toEqual({
      status: "failed",
      reason: "card declined",
    });
  });

  it("queued syncs swallow errors and log them", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    state.activeAccounts = 61;
    dodo.retrieve.mockRejectedValue(new Error("dodo down"));
    expect(() => queueAgencyExtraAccountsSync("user_1", "connect")).not.toThrow();
    await waitForAgencyExtraAccountsSync("user_1");
    expect(err).toHaveBeenCalledWith(
      "[agency-extras] sync failed; the cron will retry",
      expect.objectContaining({ userId: "user_1", reason: "dodo down" }),
    );
    err.mockRestore();
  });

  it("waits out a scheduled plan change instead of colliding with it", async () => {
    state.activeAccounts = 61;
    dodo.retrieve.mockResolvedValue({
      status: "active",
      product_id: "prod_agency",
      scheduled_change: { product_id: "prod_creator" },
      addons: [],
    });
    expect((await syncAgencyExtraAccounts("user_1")).status).toBe("failed");
    expect(dodo.changePlan).not.toHaveBeenCalled();
  });

  it("skips users who are not on Agency", async () => {
    state.tier = "creator";
    expect(await syncAgencyExtraAccounts("user_1")).toEqual({
      status: "skipped",
      reason: "not_agency",
    });
    expect(dodo.retrieve).not.toHaveBeenCalled();
  });

  it("repairs our stored copy when Dodo already matches (missed webhook)", async () => {
    state.activeAccounts = 62;
    state.storedExtras = 0;
    dodoHas(3);
    expect((await syncAgencyExtraAccounts("user_1")).status).toBe("unchanged");
    expect(state.updates).toEqual([{ extraAccounts: 3 }]);
  });
});
