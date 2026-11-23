/**
 * How far a reply chain (an X, Bluesky or Threads thread) got on the platform.
 *
 * A thread is one platform call per part. When part 3 fails, parts 1-2 are
 * already live, and the publication used to be marked failed with nothing
 * recording them: no root id or URL on the row, and a Retry started over from
 * part 1. That gave Bluesky and Threads a second root post, and on X the
 * retry hit the duplicate-content 403 on part 1 forever while half the thread
 * was live. Each run now records what is live after every part, and the next
 * run of the same publication continues from there instead.
 *
 * Stored at `posts.metadata._threadProgress[publicationId]` (there is no
 * column for it). Each write is a single jsonb merge, so the concurrent
 * platform runs of one post never overwrite each other's entries. Keyed by
 * publication: an edit deletes and recreates the publication rows, so an old
 * entry can never apply to new rows. The fingerprint covers the parts as
 * authored, so progress recorded for different content is ignored.
 * Reserved in `post-metadata-sanitize.ts`, so clients cannot set it.
 */

import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { posts } from "../../db/schema.js";
import { publishLog } from "../publish-log.js";

export const THREAD_PROGRESS_KEY = "_threadProgress";

export type ThreadProgress = {
  /** `threadFingerprint` of the parts this progress belongs to. */
  fingerprint: string;
  /** Parts already live, in order: the next run starts at this index. */
  posted: number;
  /** Platform id of part 1 (the publication's platformPostId). */
  rootId: string;
  /** Platform id of the last live part: the next part replies to it. */
  lastId: string;
  /** Bluesky reply refs need each record's CID next to its URI. */
  rootCid?: string;
  lastCid?: string;
};

type FingerprintPart = { text: string; mediaIds: readonly string[] };

/**
 * Identify a thread's content. FNV-1a over the authored parts (text before
 * any per-account truncation, so a Premium change between attempts does not
 * look like an edit). Only compared for equality, never trusted for more.
 */
export function threadFingerprint(parts: readonly FingerprintPart[]): string {
  const input = JSON.stringify(parts.map((p) => [p.text, [...p.mediaIds]]));
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${parts.length}:${hash.toString(16).padStart(8, "0")}`;
}

const nonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

/**
 * The saved progress for this publication, when it matches this content and
 * at least one part is live. Anything malformed reads as "nothing posted".
 */
export function readThreadProgress(
  metadata: unknown,
  publicationId: string,
  fingerprint: string,
  partCount: number,
): ThreadProgress | null {
  if (!metadata || typeof metadata !== "object") return null;
  const all = (metadata as Record<string, unknown>)[THREAD_PROGRESS_KEY];
  if (!all || typeof all !== "object" || Array.isArray(all)) return null;
  const raw = (all as Record<string, unknown>)[publicationId];
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.fingerprint !== fingerprint) return null;
  const posted = p.posted;
  if (
    typeof posted !== "number" ||
    !Number.isInteger(posted) ||
    posted < 1 ||
    posted > partCount
  ) {
    return null;
  }
  if (!nonEmpty(p.rootId) || !nonEmpty(p.lastId)) return null;
  return {
    fingerprint,
    posted,
    rootId: p.rootId,
    lastId: p.lastId,
    ...(nonEmpty(p.rootCid) ? { rootCid: p.rootCid } : {}),
    ...(nonEmpty(p.lastCid) ? { lastCid: p.lastCid } : {}),
  };
}

/**
 * `metadata._threadProgress[publicationId] = entry`, merged in one statement
 * so another platform's concurrent write to the same post is not lost.
 * `::text` / `::jsonb` casts: `jsonb_build_object` is variadic "any" and
 * cannot type a bare parameter (42P18, see `post-metadata-claim.ts`).
 */
export function threadProgressMergeSql(
  publicationId: string,
  progress: ThreadProgress,
): SQL {
  const base = sql`(case when jsonb_typeof(${posts.metadata}) = 'object' then ${posts.metadata} else '{}'::jsonb end)`;
  const current = sql`(case when jsonb_typeof(${posts.metadata} -> ${THREAD_PROGRESS_KEY}::text) = 'object' then ${posts.metadata} -> ${THREAD_PROGRESS_KEY}::text else '{}'::jsonb end)`;
  return sql`jsonb_set(${base}, array[${THREAD_PROGRESS_KEY}::text], ${current} || jsonb_build_object(${publicationId}::text, ${JSON.stringify(progress)}::jsonb))`;
}

/**
 * Record that `progress.posted` parts are live. Never throws: the parts are
 * already on the platform, and abandoning the rest of the chain over a
 * bookkeeping write would leave the thread half posted for certain.
 */
export async function saveThreadProgress(
  postId: string,
  publicationId: string,
  progress: ThreadProgress,
): Promise<boolean> {
  try {
    await db
      .update(posts)
      .set({ metadata: threadProgressMergeSql(publicationId, progress) })
      .where(eq(posts.id, postId));
    return true;
  } catch (e) {
    publishLog.error(
      `[thread-progress] could not record part ${progress.posted} of publication ${publicationId}:`,
      e,
    );
    return false;
  }
}

/** The publication's error when a thread stopped after some parts went live. */
export function partialThreadError(
  error: string,
  posted: number,
  total: number,
): string {
  if (posted <= 0 || posted >= total) return error;
  return `${error} (${posted} of ${total} thread parts are live; Retry continues from part ${posted + 1}.)`;
}
