import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { posts } from "../../db/schema.js";

type SettledStatus = "published" | "partial";

/**
 * What a "publishing" post has settled into, judged from its delivery rows, or
 * `null` while it has not settled.
 *
 * Every row must be terminal first, the same rule `maybeFinalizePostPublish`
 * applies: X can publish and TikTok fail on the API within seconds while
 * YouTube is still queued or uploading on the CF worker. Calling that post
 * "partial" early lets deletePost remove it mid-upload (orphaning the YouTube
 * post), lets postAgain post to YouTube twice, and shows the in-flight row as
 * a failure with a Retry.
 *
 * All rows failed is left alone (as before): finalize owns that outcome.
 */
export function settledPublishingStatus(
  pubs: ReadonlyArray<{ status: string | null }>,
): SettledStatus | null {
  if (pubs.length === 0) return null;
  if (pubs.some((p) => p.status !== "published" && p.status !== "failed")) {
    return null;
  }
  const someFailed = pubs.some((p) => p.status === "failed");
  const somePublished = pubs.some((p) => p.status === "published");
  if (!someFailed) return "published";
  return somePublished ? "partial" : null;
}

/**
 * The write-side twin of `settledPublishingStatus`: the post is still
 * "publishing" and none of its deliveries is still open (or, for
 * "published", none is anything but published). Re-checked in the UPDATE
 * itself, because a Retry or a slow platform job can move a row between the
 * list read and this write.
 */
export function settlePublishingWhere(
  postIds: string[],
  status: SettledStatus,
): SQL | undefined {
  const blocking =
    status === "published"
      ? sql`pp.status <> 'published'`
      : sql`pp.status in ('pending', 'publishing')`;
  return and(
    inArray(posts.id, postIds),
    eq(posts.status, "publishing"),
    sql`not exists (select 1 from post_publications pp where pp.post_id = ${posts.id} and ${blocking})`,
  );
}

/**
 * Settle posts left in "publishing" after every delivery finished (a finalize
 * that never ran: deploy, killed isolate). Status only: emails, webhooks,
 * auto-features and the queue slot stay with `maybeFinalizePostPublish`. Moving
 * the post out of "publishing" takes it past the stale-publishing sweep, so
 * the finalize it still owes is picked up by the background worker's
 * unfinalized-post sweep instead (it looks for terminal posts without
 * `POST_FINALIZED_KEY`).
 */
export async function settlePublishingPosts(
  postIds: string[],
  status: SettledStatus,
): Promise<void> {
  if (postIds.length === 0) return;
  await db
    .update(posts)
    .set({ status, updatedAt: new Date() })
    .where(settlePublishingWhere(postIds, status));
}
