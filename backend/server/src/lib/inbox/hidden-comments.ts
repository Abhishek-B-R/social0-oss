/**
 * Comments hidden through Social0, remembered per connected account.
 *
 * Comment lists are cached per publication and date window (and stashed for a
 * week to serve during platform cooldowns), so a copy fetched before the hide
 * can keep coming back after it. The fetchers drop comments the platform
 * reports as hidden; this covers the cached copies until they expire.
 */

import { redis } from "../redis.js";
import { withRedisTimeout } from "../redis-safe.js";
import { pruneBoundedMap, STASH_TTL_SEC } from "../platform-api-cache.js";
import type { InboxComment } from "./types.js";

const MEM_MAX_ACCOUNTS = 200;

/** Process-local copy (also the only store when Redis is not configured). */
const memHidden = new Map<string, { exp: number; ids: Set<string> }>();

function key(accountId: string): string {
  return `inbox:hidden:${accountId}`;
}

export async function rememberHiddenComment(
  accountId: string,
  commentId: string,
): Promise<void> {
  const now = Date.now();
  const entry = memHidden.get(accountId);
  const ids = entry && entry.exp > now ? entry.ids : new Set<string>();
  ids.add(commentId);
  memHidden.set(accountId, { exp: now + STASH_TTL_SEC * 1000, ids });
  pruneBoundedMap(memHidden, MEM_MAX_ACCOUNTS);
  if (!redis) return;
  await withRedisTimeout(
    `inbox hidden add ${accountId}`,
    async () => {
      await redis!.sadd(key(accountId), commentId);
      await redis!.expire(key(accountId), STASH_TTL_SEC);
    },
    undefined,
  );
}

export async function hiddenCommentIds(accountId: string): Promise<Set<string>> {
  const entry = memHidden.get(accountId);
  const local = entry && entry.exp > Date.now() ? entry.ids : new Set<string>();
  if (!redis) return new Set(local);
  const remote = await withRedisTimeout(
    `inbox hidden get ${accountId}`,
    async () => (await redis!.smembers(key(accountId))) as string[],
    [] as string[],
  );
  return new Set([...local, ...remote.map(String)]);
}

/** Drop hidden comments and the replies under them. */
export function withoutHiddenComments(
  comments: InboxComment[],
  hidden: ReadonlySet<string>,
): InboxComment[] {
  if (hidden.size === 0) return comments;
  return comments.filter(
    (c) => !hidden.has(c.id) && !(c.parentId && hidden.has(c.parentId)),
  );
}
