import { useCallback, type ReactNode } from "react";
import { useLimitModal } from "@/components/billing/use-limit-modal";
import { useComposerSettings } from "@/features/dashboard/composer/use-composer-data";
import { freePublishBlockReason } from "@/lib/free-tier-publish";

/**
 * Publishing a draft costs one free post (the server charges it in
 * `publish.publishPost`). When the free posts are used up, "Publish now" on a
 * draft opens the plan-limit moment instead of a request that would fail.
 * Scheduled / failed posts were already charged, so they are never gated.
 * Until settings load, nothing is gated and the server stays the judge.
 */
export function useDraftPublishGate(): {
  /** True when the limit modal opened instead; the caller must not publish. */
  blocksPublish: (uiStatus: string) => boolean;
  limitModal: ReactNode;
} {
  const { tier, freePostsUsed } = useComposerSettings();
  const { openLimit, limitModal } = useLimitModal();

  const blocksPublish = useCallback(
    (uiStatus: string) => {
      if (uiStatus !== "draft") return false;
      if (!freePublishBlockReason(tier, freePostsUsed, "now")) return false;
      openLimit("free_posts", { currentTier: tier });
      return true;
    },
    [tier, freePostsUsed, openLimit],
  );

  return { blocksPublish, limitModal };
}
