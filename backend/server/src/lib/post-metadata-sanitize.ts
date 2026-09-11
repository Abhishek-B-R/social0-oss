/**
 * Keys on `posts.metadata` that the publish pipeline owns.
 *
 * `post-metadata-claim.ts` uses "key is null" as a one-shot latch for the
 * failure email and the publish webhook. Client-supplied metadata flows
 * straight into that column, so a caller that pre-sets one of these keys wins
 * the claim before the pipeline can and the side effect never fires.
 */
const RESERVED_POST_METADATA_KEYS = new Set([
  "_failureEmailSentAt",
  "_publishWebhookSentAt",
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
