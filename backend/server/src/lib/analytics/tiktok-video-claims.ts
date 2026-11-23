/**
 * Guards for the TikTok publish-time backfill (fetch-platform-metrics.ts).
 *
 * A backfilled video id is persisted onto post_publications and never
 * re-resolved, so a wrong match is permanent. These helpers keep a match from
 * landing on a video another publication of the same account already owns.
 */

import { and, eq, isNotNull, ne, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/index.js";
import { postPublications } from "../../db/schema.js";
import { isTikTokVideoId } from "../tiktok-post-id.js";
import type { TikTokBackfillContext } from "./fetch-platform-metrics.js";
import { isUniqueViolation } from "../pg-errors.js";

type OtherPublication = {
  platformPostId: string | null;
  publishedAt: Date | null;
  status: string | null;
};

/**
 * Split the account's other publications into video ids they already own and
 * publish times of the ones still waiting on a video id (rivals for a match).
 */
export function tikTokBackfillContextFromRows(
  rows: OtherPublication[],
): Required<TikTokBackfillContext> {
  const claimedVideoIds = new Set<string>();
  const rivalPublishedAt: Date[] = [];
  for (const row of rows) {
    if (isTikTokVideoId(row.platformPostId)) {
      claimedVideoIds.add(row.platformPostId!);
    } else if (row.status === "published" && row.publishedAt) {
      rivalPublishedAt.push(row.publishedAt);
    }
  }
  return { claimedVideoIds, rivalPublishedAt };
}

export async function loadTikTokBackfillContext(opts: {
  connectedAccountId: string;
  publicationId: string;
}): Promise<Required<TikTokBackfillContext>> {
  const rows = await db
    .select({
      platformPostId: postPublications.platformPostId,
      publishedAt: postPublications.publishedAt,
      status: postPublications.status,
    })
    .from(postPublications)
    .where(
      and(
        eq(postPublications.connectedAccountId, opts.connectedAccountId),
        ne(postPublications.id, opts.publicationId),
        isNotNull(postPublications.platformPostId),
      ),
    );
  return tikTokBackfillContextFromRows(rows);
}

/**
 * Store a resolved platform post id, unless another publication of the same
 * account already holds it (two concurrent backfills raced to one video).
 * Returns whether the id was written.
 */
export async function persistResolvedPlatformPostId(opts: {
  publicationId: string;
  connectedAccountId: string;
  platformPostId: string;
}): Promise<boolean> {
  const other = alias(postPublications, "other_publication");
  let written: { id: string }[];
  try {
    written = await db
      .update(postPublications)
      .set({ platformPostId: opts.platformPostId, updatedAt: new Date() })
      .where(
        and(
          eq(postPublications.id, opts.publicationId),
          notExists(
            db
              .select({ id: other.id })
              .from(other)
              .where(
                and(
                  eq(other.connectedAccountId, opts.connectedAccountId),
                  eq(other.platformPostId, opts.platformPostId),
                  ne(other.id, opts.publicationId),
                ),
              ),
          ),
        ),
      )
      .returning({ id: postPublications.id });
  } catch (err) {
    // A concurrent backfill committed the same id first.
    if (
      isUniqueViolation(err, "post_publications_account_platform_post_unique")
    ) {
      return false;
    }
    throw err;
  }
  return written.length > 0;
}
