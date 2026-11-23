/**
 * Keys on `posts.metadata` that the publish pipeline owns.
 *
 * `post-metadata-claim.ts` uses "key is null" as a one-shot latch for the
 * failure email, the publish webhook and the Auto-Repost / Auto-Plug setup
 * (`publish/bulk-auto-features.ts`). Client-supplied metadata flows
 * straight into that column, so a caller that pre-sets one of these keys wins
 * the claim before the pipeline can and the side effect never fires.
 */
const RESERVED_POST_METADATA_KEYS = new Set([
  "_failureEmailSentAt",
  "_publishWebhookSentAt",
  "_bulkAutoFeaturesSetupAt",
  // Finalize ran for this attempt (`POST_FINALIZED_KEY`). A client value
  // would hide a post whose finalize died from the unfinalized-post sweep.
  "_finalizedAt",
  // Background worker: when this post's scheduled dispatch first failed. A
  // client value would move its give-up window (publish-scheduled.ts).
  "_dispatchFirstFailedAt",
  // How many parts of each publication's thread are already live
  // (publish-platforms/thread-progress.ts). A client value would make a
  // publish skip parts it never posted.
  "_threadProgress",
]);

export function isReservedPostMetadataKey(key: string): boolean {
  return RESERVED_POST_METADATA_KEYS.has(key);
}

/**
 * Strip pipeline-owned keys from client-supplied post metadata.
 * Returns null for an empty/absent object so the column stays NULL.
 */
export function sanitizePostMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const entries = Object.entries(metadata).filter(
    ([key]) => !isReservedPostMetadataKey(key),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}
