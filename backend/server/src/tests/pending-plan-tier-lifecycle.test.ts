import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

/**
 * `pending_plan_tier` is a change scheduled on one subscription. It must end
 * with that subscription: left behind, the renewal webhook of a later
 * subscription treated it as a "legacy local-only change" and moved the new
 * subscription to it with do_not_bill (Starter price, Max plan).
 */

const { sharedDb, serverDb, conflictSets, updates } = vi.hoisted(() => {
  const conflictSets: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const makeDb = () => ({
    query: { userSettings: { findFirst: vi.fn() } },
    update: vi.fn(() => ({
      set: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return {
          where: () => ({ returning: async () => [{ userId: "user_1" }] }),
        };
      },
    })),
    insert: vi.fn(() => ({
      values: () => ({
        onConflictDoUpdate: (cfg: { set: Record<string, unknown> }) => {
          conflictSets.push(cfg.set);
          const done = Promise.resolve(undefined) as Promise<undefined> & {
            returning: () => Promise<{ userId: string }[]>;
          };
          done.returning = async () => [{ userId: "user_1" }];
          return done;
        },
      }),
    })),
  });
  return { sharedDb: makeDb(), serverDb: makeDb(), conflictSets, updates };
});

vi.mock("@social0/shared/db/instance", () => ({ db: sharedDb }));
vi.mock("@social0/shared/lib/plan-limits", () => ({
  syncConnectedAccountsToLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../db/index.js", () => ({ db: serverDb }));
vi.mock("../lib/workspace/context.js", () => ({
  ensureOwnerWorkspace: vi.fn().mockResolvedValue(undefined),
}));

import {
  getSubscriptionForUser,
  setSubscription,
} from "@social0/shared/lib/subscription";
import { setSubscriptionIfCanonical } from "../lib/subscription.js";

const dialect = new PgDialect();

function render(value: unknown) {
  return dialect.sqlToQuery(value as SQL);
}

beforeEach(() => {
  vi.clearAllMocks();
  conflictSets.length = 0;
  updates.length = 0;
});

describe("setSubscription", () => {
  it("clears a scheduled plan change when the plan ends (on_hold, cancelled, zombie revert)", async () => {
    await setSubscription("user_1", {
      tier: "free",
      expiresAt: null,
      subscriptionId: null,
      customerId: null,
    });
    expect(conflictSets).toHaveLength(1);
    expect(conflictSets[0]).toMatchObject({
      subscriptionTier: "free",
      pendingPlanTier: null,
      downgradeReason: null,
    });
  });

  it("leaves a scheduled plan change alone while the plan stays paid", async () => {
    await setSubscription("user_1", {
      tier: "starter",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      subscriptionId: "sub_A",
      customerId: "cus_1",
    });
    expect(conflictSets[0]).not.toHaveProperty("pendingPlanTier");
    expect(conflictSets[0]).not.toHaveProperty("downgradeReason");
  });
});

describe("getSubscriptionForUser lapse", () => {
  it("clears the scheduled change of the plan that lapsed", async () => {
    sharedDb.query.userSettings.findFirst.mockResolvedValue({
      subscriptionTier: "starter",
      subscriptionExpiresAt: new Date(Date.now() - 60_000),
      subscriptionId: "sub_A",
      customerId: "cus_1",
      hasUsedTrial: true,
      pendingPlanTier: "max",
      subscriptionCancelAtPeriodEnd: true,
    });

    const sub = await getSubscriptionForUser("user_1");

    expect(sub.tier).toBe("free");
    expect(sub.pendingPlanTier).toBeNull();
    expect(updates).toEqual([
      expect.objectContaining({ pendingPlanTier: null, downgradeReason: null }),
    ]);
  });
});

describe("setSubscriptionIfCanonical", () => {
  async function bind(subscriptionId: string) {
    await setSubscriptionIfCanonical("user_1", null, {
      tier: "starter",
      expiresAt: null,
      subscriptionId,
      customerId: "cus_1",
    });
    return conflictSets[0]!;
  }

  for (const column of ["pendingPlanTier", "downgradeReason"] as const) {
    it(`keeps ${column} only when the stored subscription is the one being bound`, async () => {
      const set = await bind("sub_B");
      const { sql, params } = render(set[column]);
      // Same subscription (plan_changed / renewal re-sync): keep the column.
      // Anything else (a brand-new subscription after the old one ended):
      // start with no scheduled change.
      const kept =
        column === "pendingPlanTier" ? "pending_plan_tier" : "downgrade_reason";
      expect(sql).toBe(
        `CASE WHEN "user_settings"."subscription_id" IS NOT DISTINCT FROM $1 THEN "user_settings"."${kept}" ELSE NULL END`,
      );
      expect(params).toEqual(["sub_B"]);
    });
  }

  it("still writes the plan itself", async () => {
    const set = await bind("sub_B");
    expect(set).toMatchObject({
      subscriptionTier: "starter",
      subscriptionId: "sub_B",
      hasUsedTrial: true,
    });
  });
});
