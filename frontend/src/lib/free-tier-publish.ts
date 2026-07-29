import type { PublishMode } from "@/api/posts";
import type { SubscriptionTier } from "@/lib/plans";
import { getPlanLimits } from "@/lib/plans";

export function getFreePostsRemaining(
  tier: SubscriptionTier,
  freePostsUsed: number,
): number {
  if (tier !== "free") return Number.POSITIVE_INFINITY;
  return Math.max(0, getPlanLimits("free").maxFreePosts - freePostsUsed);
}

/** True when free-tier quota blocks Post now / Schedule (never drafts). */
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

/**
 * Client-side gate before any create/publish/schedule/draft RPC.
 * Returns a user-facing error, or null when OK to proceed.
 */
export function getComposerSubmitBlockReason(opts: {
  action: PublishMode;
  selectedAccountCount: number;
  subscriptionTier: SubscriptionTier;
  freePostsUsed: number;
}): string | null {
  if (opts.selectedAccountCount < 1) {
    return opts.action === "draft"
      ? "Select at least one account before saving a draft."
      : "Select at least one account to post.";
  }
  if (opts.action === "now" || opts.action === "scheduled") {
    return freePublishBlockReason(
      opts.subscriptionTier,
      opts.freePostsUsed,
      opts.action,
    );
  }
  return null;
}
