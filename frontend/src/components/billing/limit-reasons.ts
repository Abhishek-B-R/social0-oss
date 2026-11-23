import type { SellablePlanTier, SubscriptionTier } from "@/lib/plans";
import { nextPlanAbove, tierRank } from "./plan-catalog";

/** Why the user hit a wall. Pick the one that matches the action they tried. */
export type LimitReason =
  | "accounts"
  | "free_posts"
  | "bulk_tools"
  | "autoplug"
  | "resurface"
  | "teams"
  | "workspaces";

/**
 * Plan that unlocks the thing behind `reason` for someone on `tier`. Only
 * Creator or Agency is ever suggested. Null on Agency hitting the account cap
 * (they add extra accounts instead) or when nothing sold is bigger.
 */
export function recommendedPlanFor(
  reason: LimitReason,
  tier: SubscriptionTier,
): SellablePlanTier | null {
  if (reason === "accounts") return nextPlanAbove(tier);
  const floor: SellablePlanTier = reason === "teams" ? "agency" : "creator";
  if (tierRank(floor) > tierRank(tier)) return floor;
  // Legacy plans that rank above the floor but lack the feature (e.g. Starter
  // has no bulk tools) still get a sold plan that has it.
  return tierRank("agency") > tierRank(tier) ? "agency" : null;
}
