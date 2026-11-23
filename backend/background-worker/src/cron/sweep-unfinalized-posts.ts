import { and, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { postPublications, posts } from "../db/schema.js";

/**
 * `posts.metadata` key `maybeFinalizePostPublish` writes as its last step.
 * Mirrors `POST_FINALIZED_KEY` in `server/src/lib/post-metadata-claim.ts`.
 */
export const POST_FINALIZED_KEY = "_finalizedAt";

/**
 * How long after its last delivery settled a post is left to the publish path's
 * own finalize, which normally runs within seconds of it.
 */
export const UNFINALIZED_GRACE_MS = 5 * 60 * 1000;

/**
 * How far back the sweep looks. Posts finalized before the marker existed
 * carry no marker, so an unbounded sweep would re-finalize the whole history;
 * a day covers any outage this sweep exists for.
 */
export const UNFINALIZED_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Most posts one tick asks to finalize; the rest wait for the next tick. */
export const UNFINALIZED_SWEEP_LIMIT = 50;

/**
 * Raw `sql` params skip drizzle's column mapping and node-postgres would send
 * a Date in the process's local zone; the columns hold UTC `timestamp`s.
 */
function utc(d: Date): string {
  return d.toISOString();
}

/**
 * Terminal posts whose finalize never finished: no `POST_FINALIZED_KEY`, every
 * delivery published or failed, and the last one settled between
 * `settledAfter` and `settledBefore`.
 *
 * The window is on the deliveries, not on `posts.updated_at`: finalize bumps
 * the post's timestamp each time it runs, so a finalize that keeps failing
 * would otherwise keep its post in the window forever.
 */
export function unfinalizedPostsWhere(
  settledAfter: Date,
  settledBefore: Date,
): SQL | undefined {
  const settledAt = sql`coalesce(${postPublications.updatedAt}, ${postPublications.createdAt})`;
  return and(
    inArray(posts.status, ["published", "partial", "failed"]),
    sql`(${posts.metadata} ->> ${POST_FINALIZED_KEY}::text) is null`,
    inArray(
      posts.id,
      db
        .select({ postId: postPublications.postId })
        .from(postPublications)
        .where(
          and(
            sql`${settledAt} >= ${utc(settledAfter)}`,
            sql`${settledAt} < ${utc(settledBefore)}`,
          ),
        ),
    ),
    // Nothing still open (finalize waits for that itself), and nothing that
    // settled inside the grace period (its own finalize may be running now).
    sql`not exists (select 1 from post_publications pp where pp.post_id = ${posts.id} and (pp.status is null or pp.status not in ('published', 'failed') or coalesce(pp.updated_at, pp.created_at) >= ${utc(settledBefore)}))`,
  );
}

/**
 * Ask the API to finalize posts that reached a terminal status without
 * finalize finishing.
 *
 * The stale-`publishing` sweep only sees posts still in `publishing`, but
 * several writers move a post to its terminal status before finalize runs:
 * `recordPlatformResultServer`, the CF worker's `recordPlatformResult`,
 * `executePublish`, and the posts list's settle. If the process or isolate
 * died before finalize (a deploy), or finalize threw, the post looked done
 * while its failure email, `post.published` / `post.failed` webhook,
 * Auto-Repost / Auto-Plug setup and queue-slot settlement never happened.
 * Finalize is idempotent and claim-guarded, so asking twice is harmless.
 *
 * Returns how many posts it asked for.
 */
export async function sweepUnfinalizedPosts(
  requestFinalize: (
    postId: string,
    userId: string,
    context: string,
  ) => void | Promise<void>,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ id: posts.id, userId: posts.userId })
    .from(posts)
    .where(
      unfinalizedPostsWhere(
        new Date(now.getTime() - UNFINALIZED_LOOKBACK_MS),
        new Date(now.getTime() - UNFINALIZED_GRACE_MS),
      ),
    )
    .limit(UNFINALIZED_SWEEP_LIMIT);
  for (const row of rows) {
    await requestFinalize(row.id, row.userId, "for unfinalized terminal post");
  }
  return rows.length;
}
