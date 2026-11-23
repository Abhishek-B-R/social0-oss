import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `subscriptionExpiresAt` holds Dodo's next_billing_date: when Dodo *tries*
 * the renewal, not when access ends. Reading the subscription past that
 * instant used to downgrade the user and null their subscription id, so the
 * on_hold webhook for a declined renewal no longer recognised the
 * subscription and cancelled it in Dodo.
 */

const { mockDb, mockSync, updates } = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  mockSync: vi.fn(),
  mockDb: {
    query: { userSettings: { findFirst: vi.fn() } },
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@social0/shared/db/instance", () => ({ db: mockDb }));
vi.mock("@social0/shared/lib/plan-limits", () => ({
  syncConnectedAccountsToLimit: mockSync,
}));

import {
  getSubscriptionForUser,
  hasSubscriptionLapsed,
  RENEWAL_GRACE_MS,
} from "@social0/shared/lib/subscription";

const HOUR = 60 * 60 * 1000;

function settingsRow(overrides: Record<string, unknown>) {
  return {
    subscriptionTier: "pro",
    subscriptionExpiresAt: new Date(Date.now() + 10 * 24 * HOUR),
    subscriptionId: "sub_A",
    customerId: "cus_1",
    hasUsedTrial: true,
    pendingPlanTier: null,
    subscriptionCancelAtPeriodEnd: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  mockSync.mockResolvedValue(undefined);
  mockDb.update.mockReturnValue({
    set: (patch: Record<string, unknown>) => {
      updates.push(patch);
      return {
        where: () => ({ returning: async () => [{ userId: "user_1" }] }),
      };
    },
  });
});

describe("hasSubscriptionLapsed", () => {
  const now = new Date("2030-01-10T00:00:00Z");

  it("is false before the billing date", () => {
    expect(hasSubscriptionLapsed(new Date("2030-01-11T00:00:00Z"), true, now)).toBe(false);
  });

  it("is false inside the renewal grace window", () => {
    expect(hasSubscriptionLapsed(new Date(now.getTime() - HOUR), false, now)).toBe(false);
  });

  it("is true once the grace window has passed", () => {
    expect(
      hasSubscriptionLapsed(new Date(now.getTime() - RENEWAL_GRACE_MS), false, now),
    ).toBe(true);
  });

  it("is true right after the billing date when the user cancelled at period end", () => {
    expect(hasSubscriptionLapsed(new Date(now.getTime() - 1000), true, now)).toBe(true);
  });
});

describe("getSubscriptionForUser around the billing date", () => {
  it("keeps a renewing paid plan (and its ids) while the renewal is in flight", async () => {
    const expiresAt = new Date(Date.now() - HOUR);
    mockDb.query.userSettings.findFirst.mockResolvedValue(
      settingsRow({ subscriptionExpiresAt: expiresAt }),
    );

    const sub = await getSubscriptionForUser("user_1");

    expect(sub.tier).toBe("pro");
    expect(sub.subscriptionId).toBe("sub_A");
    expect(sub.customerId).toBe("cus_1");
    expect(sub.expiresAt).toEqual(expiresAt);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("downgrades a cancel-at-period-end plan at the billing date without clearing its ids", async () => {
    mockDb.query.userSettings.findFirst.mockResolvedValue(
      settingsRow({
        subscriptionExpiresAt: new Date(Date.now() - HOUR),
        subscriptionCancelAtPeriodEnd: true,
      }),
    );

    const sub = await getSubscriptionForUser("user_1");

    expect(sub.tier).toBe("free");
    expect(updates).toEqual([
      {
        subscriptionTier: "free",
        subscriptionCancelAtPeriodEnd: false,
        pendingPlanTier: null,
        downgradeReason: null,
        extraAccounts: 0,
      },
    ]);
    // The webhooks look the user up by subscription id; it must survive.
    expect(updates[0]).not.toHaveProperty("subscriptionId");
    expect(updates[0]).not.toHaveProperty("customerId");
    expect(mockDb.insert).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(mockSync).toHaveBeenCalledWith("user_1"));
  });

  it("downgrades once the renewal webhook is overdue past the grace window", async () => {
    mockDb.query.userSettings.findFirst.mockResolvedValue(
      settingsRow({
        subscriptionExpiresAt: new Date(Date.now() - RENEWAL_GRACE_MS - HOUR),
      }),
    );

    const sub = await getSubscriptionForUser("user_1");

    expect(sub.tier).toBe("free");
    expect(updates).toEqual([
      {
        subscriptionTier: "free",
        subscriptionCancelAtPeriodEnd: false,
        pendingPlanTier: null,
        downgradeReason: null,
        extraAccounts: 0,
      },
    ]);
  });

  it("skips the connection sync when another read already downgraded the row", async () => {
    mockDb.query.userSettings.findFirst.mockResolvedValue(
      settingsRow({
        subscriptionExpiresAt: new Date(Date.now() - RENEWAL_GRACE_MS - HOUR),
      }),
    );
    mockDb.update.mockReturnValue({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    });

    const sub = await getSubscriptionForUser("user_1");
    await new Promise((r) => setTimeout(r, 0));

    expect(sub.tier).toBe("free");
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("reads a lapsed free row as free without writing again", async () => {
    mockDb.query.userSettings.findFirst.mockResolvedValue(
      settingsRow({
        subscriptionTier: "free",
        subscriptionExpiresAt: new Date(Date.now() - HOUR),
      }),
    );

    const sub = await getSubscriptionForUser("user_1");

    expect(sub.tier).toBe("free");
    expect(sub.expiresAt).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
