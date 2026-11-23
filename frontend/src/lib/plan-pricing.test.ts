import { describe, expect, it } from "vitest";
import {
  agencyExtraAccounts,
  getEffectiveMonthly,
  planPriceForAccounts,
  priceForAccounts,
  recommendedPlan,
  yearlySavings,
} from "./plan-pricing";
import { getPlanLimits } from "./plans";

describe("priceForAccounts", () => {
  const cases: Array<[number, "creator" | "agency", number, number]> = [
    // accounts, plan, monthly, yearly
    [1, "creator", 29.9, 299],
    [15, "creator", 29.9, 299],
    [16, "agency", 59.9, 599],
    [59, "agency", 59.9, 599],
    [60, "agency", 60.9, 609],
    [200, "agency", 200.9, 2009],
  ];

  for (const [accounts, plan, monthly, yearly] of cases) {
    it(`${accounts} accounts → ${plan} $${monthly}/mo, $${yearly}/yr`, () => {
      expect(priceForAccounts(accounts, "monthly")).toEqual({ plan, price: monthly });
      expect(priceForAccounts(accounts, "yearly")).toEqual({ plan, price: yearly });
    });
  }
});

describe("planPriceForAccounts", () => {
  it("keeps Creator flat", () => {
    expect(planPriceForAccounts("creator", 1, "monthly")).toBe(29.9);
    expect(planPriceForAccounts("creator", 15, "yearly")).toBe(299);
  });

  it("adds $1/mo or $10/yr per Agency account above 59", () => {
    expect(planPriceForAccounts("agency", 12, "monthly")).toBe(59.9);
    expect(planPriceForAccounts("agency", 100, "monthly")).toBe(100.9);
    expect(planPriceForAccounts("agency", 100, "yearly")).toBe(1009);
  });
});

describe("helpers", () => {
  it("recommends Creator up to 15 accounts", () => {
    expect(recommendedPlan(15)).toBe("creator");
    expect(recommendedPlan(16)).toBe("agency");
  });

  it("counts Agency extras", () => {
    expect(agencyExtraAccounts(59)).toBe(0);
    expect(agencyExtraAccounts(60)).toBe(1);
  });

  it("prices yearly as 2 months free", () => {
    expect(yearlySavings("creator")).toBe(59.8);
    expect(getEffectiveMonthly("creator")).toBe(24.92);
  });

  it("raises the Agency account limit by paid extras", () => {
    expect(getPlanLimits("agency").maxConnectedAccounts).toBe(59);
    expect(getPlanLimits("agency", 41).maxConnectedAccounts).toBe(100);
    expect(getPlanLimits("creator", 41).maxConnectedAccounts).toBe(15);
  });
});
