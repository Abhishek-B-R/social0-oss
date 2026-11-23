import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Checkout sells only Creator and Agency. Legacy plans (Starter, Growth, Pro,
 * Max) are kept for the customers on them but never sold again, and Agency's
 * extra accounts ride the cart as a Dodo add-on, counted from the accounts the
 * user already has connected (never a number the client picks).
 */

const { mocks } = vi.hoisted(() => {
  process.env.DODO_PAYMENTS_CREATOR_PRODUCT_ID = "prod_creator";
  process.env.DODO_PAYMENTS_AGENCY_PRODUCT_ID = "prod_agency";
  process.env.DODO_PAYMENTS_AGENCY_YEARLY_PRODUCT_ID = "prod_agency_year";
  process.env.DODO_PAYMENTS_AGENCY_EXTRA_ACCOUNT_YEARLY_ADDON_ID = "adn_extra_year";
  // Monthly add-on deliberately unset: extras then cannot be billed monthly.
  delete process.env.DODO_PAYMENTS_AGENCY_EXTRA_ACCOUNT_ADDON_ID;
  return {
    mocks: {
      createSession: vi.fn(),
      resolveCheckoutSession: vi.fn(),
      agencyExtras: vi.fn(async () => 0),
    },
  };
});

vi.mock("../lib/auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: "user_1", email: "a@example.com", name: "A" },
      })),
    },
  },
}));
vi.mock("../lib/http/request-cookies.js", () => ({
  headers: async () => new Headers(),
}));
vi.mock("../lib/http/http.js", () => ({
  RouteResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("../lib/env.js", () => ({
  env: { DODO_PAYMENTS_API_KEY: "key", DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
}));
vi.mock("../lib/ratelimit.js", () => ({
  checkoutLimiter: null,
  enforceRateLimit: async () => ({ allowed: true }),
}));
vi.mock("../lib/app-url.js", () => ({
  resolveAppUrlFromRequest: () => "https://app.test",
}));
vi.mock("../lib/billing-guards.js", () => ({
  evaluateCheckoutEligibility: async () => ({ allowed: true, trialPeriodDays: 0 }),
  createCustomerPortalUrl: vi.fn(),
  resolveBillingCustomer: vi.fn(),
}));
vi.mock("../lib/pending-checkout.js", () => ({
  clearPendingCheckout: vi.fn(),
  resolveCheckoutSession: mocks.resolveCheckoutSession,
}));
vi.mock("../lib/extra-accounts.js", () => ({
  agencyExtraAccountsForUser: mocks.agencyExtras,
}));
vi.mock("dodopayments", () => ({
  default: class {
    checkoutSessions = { create: mocks.createSession };
  },
}));

import { createCheckout } from "../handlers/billing/checkout.js";

function post(body: Record<string, unknown>) {
  return createCheckout(
    new Request("https://api.test/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as Promise<{ status: number; body: Record<string, unknown> }>;
}

beforeEach(() => {
  mocks.createSession.mockReset();
  mocks.createSession.mockResolvedValue({
    checkout_url: "https://pay.test/s",
    session_id: "cs_1",
  });
  mocks.agencyExtras.mockReset();
  mocks.agencyExtras.mockResolvedValue(0);
  mocks.resolveCheckoutSession.mockReset();
  mocks.resolveCheckoutSession.mockImplementation(
    async (p: { createSession: () => Promise<{ url: string }> }) => {
      const s = await p.createSession();
      return { ok: true, url: s.url, reused: false };
    },
  );
});

describe("POST /api/billing/checkout", () => {
  it.each(["starter", "growth", "pro", "max"])(
    "rejects the legacy %s plan",
    async (plan) => {
      const res = await post({ plan });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no longer offered/i);
      expect(res.body.code).toBe("plan_not_offered");
      expect(mocks.createSession).not.toHaveBeenCalled();
    },
  );

  it("rejects an unknown plan", async () => {
    const res = await post({ plan: "enterprise" });
    expect(res.status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("creates a Creator checkout with no add-ons", async () => {
    const res = await post({ plan: "creator" });
    expect(res.status).toBe(200);
    const args = mocks.createSession.mock.calls[0][0];
    expect(args.product_cart).toEqual([{ product_id: "prod_creator", quantity: 1 }]);
  });

  it("ignores client-picked extras: Creator never carries any", async () => {
    const res = await post({ plan: "creator", extraAccounts: 3 });
    expect(res.status).toBe(200);
    const args = mocks.createSession.mock.calls[0][0];
    expect(args.product_cart).toEqual([{ product_id: "prod_creator", quantity: 1 }]);
    expect(mocks.agencyExtras).not.toHaveBeenCalled();
  });

  it("bills Agency for the accounts already connected above 59, not the client's number", async () => {
    mocks.agencyExtras.mockResolvedValue(21); // 80 accounts connected
    const res = await post({ plan: "agency", interval: "yearly", extraAccounts: 41 });
    expect(res.status).toBe(200);
    expect(mocks.agencyExtras).toHaveBeenCalledWith("user_1");
    expect(mocks.resolveCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "agency", interval: "yearly", extraAccounts: 21 }),
    );
    const args = mocks.createSession.mock.calls[0][0];
    expect(args.product_cart).toEqual([
      {
        product_id: "prod_agency_year",
        quantity: 1,
        addons: [{ addon_id: "adn_extra_year", quantity: 21 }],
      },
    ]);
  });

  it("returns 503 when extras are owed but the add-on is not configured", async () => {
    mocks.agencyExtras.mockResolvedValue(2);
    const res = await post({ plan: "agency", interval: "monthly" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/extra accounts/i);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("allows Agency with no extras even without the add-on configured", async () => {
    const res = await post({ plan: "agency", interval: "monthly" });
    expect(res.status).toBe(200);
    const args = mocks.createSession.mock.calls[0][0];
    expect(args.product_cart).toEqual([{ product_id: "prod_agency", quantity: 1 }]);
  });
});
