import { describe, expect, it } from "vitest";
import { AGENCY_EXTRA_ACCOUNT_PRICE, formatMoney, getPlanPrice } from "@/lib/plan-pricing";
import {
  defaultAgencyAccounts,
  isPaidPlan,
  lostOnDowngrade,
  nextPlanAbove,
  periodPrice,
  shortPrice,
  toSubscriptionTier,
} from "./plan-catalog";
import { recommendedPlanFor } from "./limit-reasons";

describe("plan catalog", () => {
  it("keeps legacy tiers as paid plans so grandfathered users aren't shown Free", () => {
    for (const t of ["creator", "agency", "starter", "growth", "pro", "max"]) {
      expect(isPaidPlan(t)).toBe(true);
      expect(toSubscriptionTier(t)).toBe(t);
    }
    expect(toSubscriptionTier("enterprise")).toBe("free");
  });

  it("prices Agency with extras and legacy plans at their own price", () => {
    const agencyMonthly = getPlanPrice("agency", "monthly").price;
    const agencyYearly = getPlanPrice("agency", "yearly").price;
    expect(periodPrice("agency", "monthly", 3)).toBeCloseTo(
      agencyMonthly + 3 * AGENCY_EXTRA_ACCOUNT_PRICE.monthly,
    );
    expect(periodPrice("agency", "yearly", 3)).toBeCloseTo(
      agencyYearly + 3 * AGENCY_EXTRA_ACCOUNT_PRICE.yearly,
    );
    expect(periodPrice("creator", "yearly")).toBe(getPlanPrice("creator", "yearly").price);
    expect(periodPrice("growth", "monthly")).toBe(getPlanPrice("growth", "monthly").price);
    expect(shortPrice("agency", "monthly", 10)).toBe(
      `$${formatMoney(agencyMonthly + 10 * AGENCY_EXTRA_ACCOUNT_PRICE.monthly)}/mo`,
    );
  });

  it("preselects 59 Agency accounts, or more when already connected", () => {
    expect(defaultAgencyAccounts(0)).toBe(59);
    expect(defaultAgencyAccounts(72)).toBe(72);
    expect(defaultAgencyAccounts(null)).toBe(59);
  });

  it("only ever suggests a plan that is sold", () => {
    expect(nextPlanAbove("free")).toBe("creator");
    expect(nextPlanAbove("starter")).toBe("creator");
    expect(nextPlanAbove("growth")).toBe("agency");
    expect(nextPlanAbove("creator")).toBe("agency");
    expect(nextPlanAbove("pro")).toBe("agency");
    expect(nextPlanAbove("agency")).toBeNull();
    expect(nextPlanAbove("max")).toBeNull();
  });

  it("routes limit moments to Creator or Agency", () => {
    expect(recommendedPlanFor("accounts", "creator")).toBe("agency");
    expect(recommendedPlanFor("accounts", "agency")).toBeNull();
    expect(recommendedPlanFor("teams", "free")).toBe("agency");
    expect(recommendedPlanFor("teams", "creator")).toBe("agency");
    expect(recommendedPlanFor("bulk_tools", "free")).toBe("creator");
    expect(recommendedPlanFor("bulk_tools", "starter")).toBe("creator");
    expect(recommendedPlanFor("free_posts", "free")).toBe("creator");
  });

  it("warns a legacy customer they can't come back to their plan", () => {
    const lost = lostOnDowngrade("pro", "creator");
    expect(lost.some((l) => l.includes("Teammates"))).toBe(true);
    expect(lost.some((l) => l.includes("Pro plan and price"))).toBe(true);
  });
});
