import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { postPublications, posts } from "../db/schema.js";
import { publishLog } from "./publish-log.js";
import { STUCK_PUBLISHING_MS } from "./stuck-publishing.js";

/**
 * How often a live run renews its claim. Far below `STUCK_PUBLISHING_MS` so a
 * few missed beats (a slow DB, a GC pause) never let the row read as dead.
 */
export const PUBLICATION_HEARTBEAT_MS = 60_000;

if (PUBLICATION_HEARTBEAT_MS * 4 > STUCK_PUBLISHING_MS) {
  throw new Error("PUBLICATION_HEARTBEAT_MS must stay well below STUCK_PUBLISHING_MS");
}

/**
 * Write one heartbeat: bump `updated_at` on the deliveries this run still holds
 * in `publishing`, and on the post while it is `publishing`.
 *
 * `updated_at` is the lease. A delivery idle for `STUCK_PUBLISHING_MINUTES` is
 * treated as abandoned and the post idle for an hour is swept to failed, so an
 * upload slower than that (a large YouTube video, a TikTok processing poll)
 * looked dead while it was still running. Conditional on `publishing`: a row
 * this run already finished keeps its timestamp.
 */
export async function renewPublicationLease(
  postId: string,
  publicationIds: readonly string[],
): Promise<void> {
  if (publicationIds.length === 0) return;
  const now = new Date();
  await db
    .update(postPublications)
    .set({ updatedAt: now })
    .where(
      and(
        inArray(postPublications.id, [...publicationIds]),
        eq(postPublications.status, "publishing"),
      ),
    );
  await db
    .update(posts)
    .set({ updatedAt: now })
    .where(and(eq(posts.id, postId), eq(posts.status, "publishing")));
}

/**
 * Renew the lease every `intervalMs` until the returned `stop` is called.
 * A failed beat is logged and the next one tries again: losing the heartbeat
 * must never fail the upload it protects. Beats never overlap.
 */
export function startPublicationHeartbeat(
  postId: string,
  publicationIds: readonly string[],
  intervalMs: number = PUBLICATION_HEARTBEAT_MS,
): () => void {
  if (publicationIds.length === 0) return () => undefined;
  let beating = false;
  const timer = setInterval(() => {
    if (beating) return;
    beating = true;
    renewPublicationLease(postId, publicationIds)
      .catch((e: unknown) =>
        publishLog.warn(`[publication-lease] heartbeat failed for post ${postId}:`, e),
      )
      .finally(() => {
        beating = false;
      });
  }, intervalMs);
  // Node: never keep a draining process alive just to renew a lease.
  (timer as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}
