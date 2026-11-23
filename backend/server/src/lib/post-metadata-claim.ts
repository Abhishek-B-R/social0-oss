import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { posts } from "../db/schema.js";

/**
 * One-shot claims on `posts.metadata`.
 *
 * Platform jobs finalize concurrently (CF Queues fans out one job per
 * platform), so the last two to finish can both see every publication row
 * terminal. A conditional jsonb write is how a post-level side effect — the
 * publish webhook, the failure email — happens exactly once.
 *
 * Both the failure email and the publish webhook had their own copy of this
 * SQL, and both carried the same defect (see `claimMetadataKeySql`), so it
 * lives in one place now.
 */

/**
 * `jsonb_build_object` is variadic `"any"`, so Postgres cannot infer the type
 * of a bare bind parameter and rejects the statement with 42P18
 * ("could not determine data type of parameter $1"). The `::text` casts are
 * the fix and are load-bearing — `src/tests/post-metadata-claim.test.ts`
 * fails if they are dropped, because a mocked `db` never sends SQL to a
 * server and would not otherwise notice.
 */
export function claimMetadataKeySql(key: string, value: string): SQL {
  return sql`coalesce(${posts.metadata}, '{}'::jsonb) || jsonb_build_object(${key}::text, ${value}::text)`;
}

export function releaseMetadataKeySql(key: string): SQL {
  return sql`coalesce(${posts.metadata}, '{}'::jsonb) - ${key}::text`;
}

/** Latch: the post's failure email went out (`lib/post-failure-email.ts`). */
export const FAILURE_EMAIL_SENT_KEY = "_failureEmailSentAt";
/** Latch: the post's publish webhook went out (`publish/finalize-post.ts`). */
export const PUBLISH_WEBHOOK_SENT_KEY = "_publishWebhookSentAt";
/**
 * Marker, not a claim: `maybeFinalizePostPublish` ran to the end for this
 * attempt. Several writers move a post to a terminal status before finalize
 * runs (`recordPlatformResultServer`, the CF worker's `recordPlatformResult`,
 * `executePublish`, the posts list's settle), so the status alone cannot tell
 * a finalized post from one whose finalize died with its process. The
 * background worker's unfinalized-post sweep finalizes terminal posts that
 * lack this key (`background-worker/src/cron/sweep-unfinalized-posts.ts`).
 */
export const POST_FINALIZED_KEY = "_finalizedAt";

/**
 * The latches that report a publish attempt's outcome. They dedupe the
 * concurrent finalizes of one attempt; they must not outlive it.
 */
export const PUBLISH_OUTCOME_KEYS = [
  FAILURE_EMAIL_SENT_KEY,
  PUBLISH_WEBHOOK_SENT_KEY,
  POST_FINALIZED_KEY,
] as const;

/**
 * Drop every key in `keys`, and match only posts that hold at least one of
 * them, so re-arming a post that has nothing to re-arm writes nothing.
 */
export function rearmMetadataKeysSql(keys: readonly string[]): {
  value: SQL;
  anySet: SQL;
} {
  const value = keys.reduce<SQL>(
    (acc, key) => sql`${acc} - ${key}::text`,
    sql`coalesce(${posts.metadata}, '{}'::jsonb)`,
  );
  const anySet = sql.join(
    keys.map((key) => sql`(${posts.metadata}->>${key}::text) is not null`),
    sql` or `,
  );
  return { value, anySet: sql`(${anySet})` };
}

/**
 * Stamp `key` on the post unless it is already set. True means this caller
 * won the claim and owns the side effect; false means someone else did.
 */
export async function claimPostMetadataKey(
  postId: string,
  key: string,
): Promise<boolean> {
  const claimed = await db
    .update(posts)
    .set({
      metadata: claimMetadataKeySql(key, new Date().toISOString()),
      updatedAt: new Date(),
    })
    .where(
      sql`${posts.id} = ${postId} and (${posts.metadata}->>${key}) is null`,
    )
    .returning({ id: posts.id });
  return claimed.length > 0;
}

/**
 * A new publish attempt started on this post: let its outcome be reported.
 *
 * The failure email and the publish webhook are claimed once per post, so
 * without this a post that failed, was retried and then published never sent
 * `post.published`, and a retry that failed again sent no email or webhook.
 * `executePublish` calls it after it claims publication rows: a row only goes
 * back to `publishing` once the previous attempt's rows were all terminal (a
 * Retry, an edit that recreated them), so any finalize that runs after this
 * sees the row in flight and waits for the new attempt instead of reporting
 * the old one.
 */
export async function rearmPublishOutcomeClaims(postId: string): Promise<void> {
  const { value, anySet } = rearmMetadataKeysSql(PUBLISH_OUTCOME_KEYS);
  await db
    .update(posts)
    .set({ metadata: value, updatedAt: new Date() })
    .where(sql`${posts.id} = ${postId} and ${anySet}`);
}

/**
 * Record that finalize finished for the post's current attempt. Leaves
 * `updatedAt` alone: finalize already bumped it, and this is bookkeeping.
 */
export async function markPostFinalized(postId: string): Promise<void> {
  await db
    .update(posts)
    .set({
      metadata: claimMetadataKeySql(POST_FINALIZED_KEY, new Date().toISOString()),
    })
    .where(eq(posts.id, postId));
}

/** Hand a claim back when the side effect was never actually attempted. */
export async function releasePostMetadataKey(
  postId: string,
  key: string,
): Promise<void> {
  await db
    .update(posts)
    .set({
      metadata: releaseMetadataKeySql(key),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId));
}
