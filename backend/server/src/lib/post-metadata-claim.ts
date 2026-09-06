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
