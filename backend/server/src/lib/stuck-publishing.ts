import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { postPublications, posts } from "../db/schema.js";

/**
 * How long "publishing" may sit untouched before Social0 treats it as dead
 * (a deploy, PM2 restart or killed CF isolate took the run with it).
 *
 * One number for both sides of the same promise: the UI shows a post as failed
 * with a Retry once it is this old, and the publish engine takes over a
 * delivery once it is this old. With two thresholds, a Retry clicked between
 * them restarted nothing and only skipped every row as "already in progress".
 * The SPA mirrors it in `frontend/src/features/dashboard/posts/posts-model.ts`
 * (`STUCK_PUBLISHING_MS`): keep them equal.
 */
export const STUCK_PUBLISHING_MINUTES = 15;
export const STUCK_PUBLISHING_MS = STUCK_PUBLISHING_MINUTES * 60 * 1000;

const stuckCutoffSql = sql`(now() at time zone 'utc') - ${sql.raw(
  `interval '${STUCK_PUBLISHING_MINUTES} minutes'`,
)}`;

/**
 * `idlePublicationSql` for any reference to a delivery row, e.g. an aliased
 * `pp` in a correlated subquery, where the table's own columns do not resolve.
 */
export function idlePublicationSqlFor(pub: {
  updatedAt: SQLWrapper;
  createdAt: SQLWrapper;
}): SQL<boolean> {
  return sql<boolean>`coalesce(${pub.updatedAt}, ${pub.createdAt}) < ${stuckCutoffSql}`;
}

/** A delivery with no write for `STUCK_PUBLISHING_MINUTES`. */
export const idlePublicationSql = idlePublicationSqlFor(postPublications);

/**
 * The latest of a post's created, scheduled and last-updated time is older
 * than `STUCK_PUBLISHING_MINUTES` (status not checked here). Publishing an old
 * draft or retrying an old failed post bumps `updatedAt`, so a run that just
 * started never reads as stuck.
 */
export const postPublishingStaleSql = sql<boolean>`greatest(${posts.createdAt}, ${posts.scheduledAt}, ${posts.updatedAt}) < ${stuckCutoffSql}`;

/** JS twin of `postPublishingStaleSql`. */
export function isPostPublishingStale(
  times: {
    createdAt: Date | null;
    scheduledAt: Date | null;
    updatedAt: Date | null;
  },
  now: number = Date.now(),
): boolean {
  const since = Math.max(
    times.createdAt?.getTime() ?? 0,
    times.scheduledAt?.getTime() ?? 0,
    times.updatedAt?.getTime() ?? 0,
  );
  return since > 0 && now - since > STUCK_PUBLISHING_MS;
}
