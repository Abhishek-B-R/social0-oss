import type { SubscriptionTier } from "@social0/shared/browser";
import { getPlanLimits } from "@social0/shared/browser";

export function getFreePostsRemaining(
  tier: SubscriptionTier,
  freePostsUsed: number,
): number {
  if (tier !== "free") return Number.POSITIVE_INFINITY;
  return Math.max(0, getPlanLimits("free").maxFreePosts - freePostsUsed);
}

export function isFreePublishBlocked(
  tier: SubscriptionTier,
  freePostsUsed: number,
  mode: string,
): boolean {
  if (mode === "draft") return false;
  if (tier !== "free") return false;
  return getFreePostsRemaining(tier, freePostsUsed) <= 0;
}

export function freePublishBlockReason(
  tier: SubscriptionTier,
  freePostsUsed: number,
  mode: string,
): string | null {
  if (!isFreePublishBlocked(tier, freePostsUsed, mode)) return null;
  const limit = getPlanLimits("free").maxFreePosts;
  return `You've used your ${limit} free posts. Subscribe to continue posting.`;
}
