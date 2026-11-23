/**
 * Every place a post refers to a `media_uploads` row.
 *
 * The top-level `posts.media_ids` column is only one of them: the publish
 * engine also reads ids out of client-supplied metadata —
 * `metadata.twitterThread.parts[].mediaIds` (X / Bluesky / Threads threads)
 * and `metadata.accountMedia[accountId | platform]` (per-account media). All
 * three must pass the same UUID and ownership checks, or a caller can point a
 * thread part at another tenant's upload, or at a non-UUID string that makes
 * the publish-time `media_uploads` lookup throw.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { mediaUploads } from "../db/schema.js";
import { isValidUUID } from "./validation.js";
import {
  MAX_MEDIA_IDS_PER_POST,
  validateMediaCount,
} from "./publish-validation.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function threadParts(metadata: Record<string, unknown> | null | undefined) {
  const parts = asRecord(asRecord(metadata)?.["twitterThread"])?.["parts"];
  return Array.isArray(parts) ? parts : null;
}

/**
 * Every media reference on a post: `mediaIds`, each thread part's `mediaIds`
 * and each `accountMedia` list. Unique, in first-seen order. Non-string
 * entries are skipped (the publish engine ignores them too); strings are
 * returned as-is so the caller can reject malformed ones.
 */
export function collectPostMediaIds(
  mediaIds: readonly unknown[] | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const out = new Set<string>();
  const addAll = (ids: unknown) => {
    if (!Array.isArray(ids)) return;
    for (const id of ids) if (typeof id === "string") out.add(id);
  };

  addAll(mediaIds);
  for (const part of threadParts(metadata) ?? []) {
    addAll(asRecord(part)?.["mediaIds"]);
  }
  const accountMedia = asRecord(asRecord(metadata)?.["accountMedia"]);
  for (const ids of Object.values(accountMedia ?? {})) addAll(ids);

  return [...out];
}

/**
 * Of `ids`, the ones that are well-formed UUIDs naming an upload `userId`
 * owns. Returned lower-cased (Postgres' uuid text form); compare with
 * `id.toLowerCase()`.
 */
export async function ownedMediaIdSet(
  userId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  const candidates = [
    ...new Set(ids.filter((id) => isValidUUID(id)).map((id) => id.toLowerCase())),
  ];
  if (candidates.length === 0) return new Set();
  const rows = await db
    .select({ id: mediaUploads.id })
    .from(mediaUploads)
    .where(
      and(eq(mediaUploads.userId, userId), inArray(mediaUploads.id, candidates)),
    );
  return new Set(rows.map((r) => r.id.toLowerCase()));
}

/**
 * Abuse ceiling on a post's media lists, checked per list rather than on one
 * flat count. A thread's top-level `mediaIds` is every part's media flattened
 * (the composer sends `partMediaIds.flat()`), and the thread publishers take
 * media part by part, so a thread is capped per part and its flat list only
 * against parts × ceiling. Each `accountMedia` list replaces the top-level list
 * for one account, so it gets the per-post ceiling. Returns an error message,
 * or null. Used at write time (so the user sees it on save) and again at
 * publish time for posts saved before the check existed.
 */
export function validatePostMediaCounts(
  mediaIds: readonly unknown[] | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const parts = threadParts(metadata);
  if (parts && parts.length > 0) {
    for (const part of parts) {
      const ids = asRecord(part)?.["mediaIds"];
      if (Array.isArray(ids) && validateMediaCount(ids)) {
        return `Each post in a thread can have at most ${MAX_MEDIA_IDS_PER_POST} media items.`;
      }
    }
    if ((mediaIds?.length ?? 0) > MAX_MEDIA_IDS_PER_POST * parts.length) {
      return `Each post in a thread can have at most ${MAX_MEDIA_IDS_PER_POST} media items.`;
    }
  } else {
    const err = validateMediaCount(mediaIds);
    if (err) return err;
  }

  const accountMedia = asRecord(asRecord(metadata)?.["accountMedia"]);
  for (const ids of Object.values(accountMedia ?? {})) {
    if (Array.isArray(ids)) {
      const err = validateMediaCount(ids);
      if (err) return err;
    }
  }
  return null;
}

export type PostMediaCheck =
  | { ok: true }
  | { ok: false; reason: "invalid_format" | "not_owned" };

/**
 * Write-time check: every media reference on the post (top level and
 * metadata) is a UUID naming one of `userId`'s uploads.
 */
export async function checkPostMediaOwnership(
  userId: string,
  mediaIds: readonly unknown[] | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): Promise<PostMediaCheck> {
  const ids = collectPostMediaIds(mediaIds, metadata);
  if (ids.length === 0) return { ok: true };
  if (!ids.every((id) => isValidUUID(id))) {
    return { ok: false, reason: "invalid_format" };
  }
  const owned = await ownedMediaIdSet(userId, ids);
  return ids.every((id) => owned.has(id.toLowerCase()))
    ? { ok: true }
    : { ok: false, reason: "not_owned" };
}

/**
 * Publish-time copy of the post with every media reference that is not in
 * `allowed` dropped: the same outcome as an upload that was deleted after the
 * post was saved. Leaves the input untouched.
 */
export function restrictPostMediaIds<
  T extends {
    mediaIds: string[] | null;
    metadata: Record<string, unknown> | null;
  },
>(post: T, allowed: ReadonlySet<string>): T {
  const keep = (ids: unknown): string[] =>
    Array.isArray(ids)
      ? ids.filter(
          (id): id is string =>
            typeof id === "string" && allowed.has(id.toLowerCase()),
        )
      : [];

  const metadata = asRecord(post.metadata);
  let nextMetadata = post.metadata;
  if (metadata) {
    const copy: Record<string, unknown> = { ...metadata };
    const thread = asRecord(metadata["twitterThread"]);
    const parts = threadParts(metadata);
    if (thread && parts) {
      copy["twitterThread"] = {
        ...thread,
        parts: parts.map((part) => {
          const p = asRecord(part);
          return p && "mediaIds" in p ? { ...p, mediaIds: keep(p["mediaIds"]) } : part;
        }),
      };
    }
    const accountMedia = asRecord(metadata["accountMedia"]);
    if (accountMedia) {
      copy["accountMedia"] = Object.fromEntries(
        Object.entries(accountMedia).map(([key, ids]) => [
          key,
          Array.isArray(ids) ? keep(ids) : ids,
        ]),
      );
    }
    nextMetadata = copy;
  }

  return {
    ...post,
    mediaIds: post.mediaIds ? keep(post.mediaIds) : post.mediaIds,
    metadata: nextMetadata,
  };
}
