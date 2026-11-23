import { describe, expect, it, vi } from "vitest";

// plans.ts reads the add-on ids from env when it loads.
vi.hoisted(() => {
  process.env.DODO_PAYMENTS_AGENCY_EXTRA_ACCOUNT_ADDON_ID = "adn_extra_month";
  process.env.DODO_PAYMENTS_AGENCY_EXTRA_ACCOUNT_YEARLY_ADDON_ID = "adn_extra_year";
});

import {
  agencyExtraAccountsFor,
  extraAccountsFromAddons,
  getExtraAccountAddonId,
  getPlanLimits,
  isLegacyTier,
  isSellableTier,
  tierRank,
} from "@social0/shared";
import { extraAccountAddons } from "../lib/extra-accounts.js";

describe("getPlanLimits account caps", () => {
  it("never caps Agency below the 10,000-extra backstop", () => {
    expect(getPlanLimits("agency").maxConnectedAccounts).toBe(59 + 10_000);
  });

  it("keeps Creator at 15, Free at 3 and old plans unchanged", () => {
    expect(getPlanLimits("creator").maxConnectedAccounts).toBe(15);
    expect(getPlanLimits("free").maxConnectedAccounts).toBe(3);
    expect(getPlanLimits("starter").maxConnectedAccounts).toBe(5);
    expect(getPlanLimits("growth").maxConnectedAccounts).toBe(15);
    expect(getPlanLimits("pro").maxConnectedAccounts).toBe(50);
    expect(getPlanLimits("max").maxConnectedAccounts).toBe(9999);
  });

  it("keeps Creator's feature set and leaves teams to Agency", () => {
    const creator = getPlanLimits("creator");
    expect(creator.allowBulkTools && creator.allowAutoPlug && creator.allowResurface).toBe(true);
    expect(creator.allowTeams).toBe(false);
    expect(getPlanLimits("agency").allowTeams).toBe(true);
  });

  it("keeps the free tier unchanged", () => {
    expect(getPlanLimits("free")).toMatchObject({
      maxConnectedAccounts: 3,
      maxFreePosts: 10,
    });
  });
});

describe("extraAccountsFromAddons", () => {
  it("reads the extra-account add-on quantity, monthly or yearly", () => {
    expect(extraAccountsFromAddons([{ addon_id: "adn_extra_month", quantity: 12 }])).toBe(12);
    expect(extraAccountsFromAddons([{ addon_id: "adn_extra_year", quantity: 3 }])).toBe(3);
  });

  it("ignores other add-ons and bad quantities", () => {
    expect(
      extraAccountsFromAddons([
        { addon_id: "adn_other", quantity: 99 },
        { addon_id: "adn_extra_month", quantity: -2 },
        { addon_id: "adn_extra_month", quantity: 5 },
      ]),
    ).toBe(5);
  });

  it("is 0 with no add-ons", () => {
    expect(extraAccountsFromAddons([])).toBe(0);
    expect(extraAccountsFromAddons(null)).toBe(0);
    expect(extraAccountsFromAddons(undefined)).toBe(0);
  });
});

describe("tier helpers", () => {
  it("sells only creator and agency", () => {
    expect(isSellableTier("creator")).toBe(true);
    expect(isSellableTier("agency")).toBe(true);
    for (const legacy of ["starter", "growth", "pro", "max"]) {
      expect(isSellableTier(legacy)).toBe(false);
      expect(isLegacyTier(legacy)).toBe(true);
    }
  });

  it("orders legacy and new plans for upgrade/downgrade", () => {
    expect(tierRank("creator")).toBeGreaterThan(tierRank("growth"));
    expect(tierRank("agency")).toBeGreaterThan(tierRank("pro"));
    expect(tierRank("max")).toBeGreaterThan(tierRank("agency"));
    expect(tierRank("free")).toBe(0);
  });
});

describe("agencyExtraAccountsFor", () => {
  it("bills every account above the 59 included", () => {
    expect(agencyExtraAccountsFor(0)).toBe(0);
    expect(agencyExtraAccountsFor(59)).toBe(0);
    expect(agencyExtraAccountsFor(60)).toBe(1);
    expect(agencyExtraAccountsFor(61)).toBe(2);
    expect(agencyExtraAccountsFor(200)).toBe(141);
  });

  it("stays between 0 and the backstop", () => {
    expect(agencyExtraAccountsFor(-5)).toBe(0);
    expect(agencyExtraAccountsFor(59 + 50_000)).toBe(10_000);
  });
});

describe("extraAccountAddons", () => {
  it("attaches the interval's add-on for Agency extras", () => {
    expect(getExtraAccountAddonId("yearly")).toBe("adn_extra_year");
    expect(extraAccountAddons("agency", 7, "monthly")).toEqual([
      { addon_id: "adn_extra_month", quantity: 7 },
    ]);
    expect(extraAccountAddons("agency", 7, "yearly")).toEqual([
      { addon_id: "adn_extra_year", quantity: 7 },
    ]);
  });

  it("sends an empty list (removing add-ons) otherwise", () => {
    expect(extraAccountAddons("agency", 0, "monthly")).toEqual([]);
    expect(extraAccountAddons("creator", 7, "monthly")).toEqual([]);
  });
});
