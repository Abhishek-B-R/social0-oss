/**
 * Auto-Repost / Auto-Plug saved on a post before it publishes.
 *
 * The composer (schedule, queue, draft) and the bulk tools store them as
 * `posts.metadata.bulkAutoFeatures` (see `lib/bulk-auto-features-metadata.ts`),
 * and the Automations page lists them as pending until X publishes. They are
 * turned into `resurface_schedules` / `auto_plugs` rows here, from
 * `maybeFinalizePostPublish`, because that is the one step every publish path
 * runs: CF publish worker, API-side X/TikTok jobs (composer and cron), and the
 * inline dashboard publish. `executePublish` used to do it only on its
 * whole-post branch, which a scheduled post never takes (every per-platform
 * job passes a publication filter), so a scheduled post never got either.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  autoPlugs,
  connectedAccounts,
  postPublications,
  posts,
  resurfaceEvents,
  resurfaceSchedules,
} from "../db/schema.js";
import {
  checkAutoPlugAllowed,
  checkResurfaceAllowed,
} from "../lib/plan-limits.js";
import {
  clampInt,
  clampNumber,
  coerceTrimmedString,
} from "../lib/coerce-number.js";
import {
  claimPostMetadataKey,
  releasePostMetadataKey,
} from "../lib/post-metadata-claim.js";
import { publishLog } from "../lib/publish-log.js";

/**
 * Latch on `posts.metadata`: platform jobs finalize concurrently and neither
 * table has a unique key per post, so the existence checks below cannot stop
 * two finalizes from both inserting. Reserved in `post-metadata-sanitize.ts`.
 */
export const BULK_AUTO_FEATURES_SETUP_KEY = "_bulkAutoFeaturesSetupAt";

type BulkAutoFeatures = {
  autoRepostConfig?: {
    intervalHours: number;
    maxResurfaces: number;
    plugComment?: string;
  } | null;
  autoPlugConfig?: {
    metricType: "likes" | "retweets";
    threshold: number;
    plugComment: string;
  } | null;
};

/** Post statuses an X delivery can be live under (others may have failed). */
const LIVE_POST_STATUSES = new Set(["published", "partial"]);

function readBulkAutoFeatures(metadata: unknown): BulkAutoFeatures | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const features = (metadata as Record<string, unknown>).bulkAutoFeatures;
  if (!features || typeof features !== "object" || Array.isArray(features)) {
    return null;
  }
  const f = features as BulkAutoFeatures;
  if (!f.autoRepostConfig && !f.autoPlugConfig) return null;
  return f;
}

/**
 * Called from finalize once every delivery is terminal. Gated on the X
 * delivery itself being published, not the whole post: X going out while
 * another network failed (`partial`) still gets its Auto-Repost / Auto-Plug.
 * Awaited by the caller (it runs on the CF worker too), never throws.
 */
export async function setupBulkAutoFeaturesAfterPublish(args: {
  postId: string;
  userId: string;
  publications: ReadonlyArray<{ platform: string; status: string | null }>;
}): Promise<void> {
  const xPublished = args.publications.some(
    (p) => p.platform === "twitter_x" && p.status === "published",
  );
  if (!xPublished) return;

  try {
    const [row] = await db
      .select({ metadata: posts.metadata })
      .from(posts)
      .where(and(eq(posts.id, args.postId), eq(posts.userId, args.userId)))
      .limit(1);
    const features = readBulkAutoFeatures(row?.metadata);
    if (!features) return;

    if (!(await claimPostMetadataKey(args.postId, BULK_AUTO_FEATURES_SETUP_KEY))) {
      return;
    }

    const ok = await setupBulkAutoFeatures({
      postId: args.postId,
      userId: args.userId,
      features,
    });
    if (!ok) {
      // Hand the latch back so a later finalize of this post can try again;
      // both setups skip what already exists.
      await releasePostMetadataKey(args.postId, BULK_AUTO_FEATURES_SETUP_KEY);
    }
  } catch (e) {
    publishLog.error("[bulk-auto-features] setup failed:", e);
  }
}

/** True when nothing threw (a plan gate saying no is not a failure). */
async function setupBulkAutoFeatures(args: {
  postId: string;
  userId: string;
  features: BulkAutoFeatures;
}): Promise<boolean> {
  const autoRepost = args.features.autoRepostConfig ?? null;
  const autoPlug = args.features.autoPlugConfig ?? null;
  let ok = true;

  if (autoRepost) {
    try {
      await trySetupResurface({
        postId: args.postId,
        userId: args.userId,
        intervalHours: autoRepost.intervalHours,
        maxResurfaces: autoRepost.maxResurfaces,
        plugComment:
          (typeof autoRepost.plugComment === "string"
            ? autoRepost.plugComment
            : ""
          ).trim() || null,
      });
    } catch (e) {
      ok = false;
      publishLog.error("[bulk-auto-features] resurface setup failed:", e);
    }
  }
  if (autoPlug) {
    try {
      await trySetupAutoPlug({
        postId: args.postId,
        userId: args.userId,
        metricType: autoPlug.metricType,
        threshold: autoPlug.threshold,
        plugComment: autoPlug.plugComment,
      });
    } catch (e) {
      ok = false;
      publishLog.error("[bulk-auto-features] auto-plug setup failed:", e);
    }
  }
  return ok;
}

async function trySetupResurface(args: {
  postId: string;
  userId: string;
  intervalHours: number;
  maxResurfaces: number;
  plugComment: string | null;
}): Promise<void> {
  const allowed = await checkResurfaceAllowed(args.userId);
  if (!allowed) return;

  const [p] = await db
    .select({ id: posts.id, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, args.postId), eq(posts.userId, args.userId)))
    .limit(1);
  if (!p || !LIVE_POST_STATUSES.has(p.status ?? "")) return;

  const xPub = await db
    .select({ id: postPublications.id })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        eq(postPublications.postId, args.postId),
        eq(postPublications.status, "published"),
        eq(connectedAccounts.platform, "twitter_x"),
        eq(connectedAccounts.userId, args.userId),
      ),
    )
    .limit(1);
  if (xPub.length === 0) return;

  const existing = await db
    .select({ id: resurfaceSchedules.id })
    .from(resurfaceSchedules)
    .where(eq(resurfaceSchedules.postId, args.postId))
    .limit(1);
  if (existing.length > 0) return;

  // `bulkAutoFeatures` rides on client-supplied post metadata, so the numbers
  // can be anything. `Math.max(0.5, NaN)` is NaN, which would produce an
  // Invalid Date for nextExecuteAt and a row the cron can never run.
  const capped = clampInt(args.maxResurfaces, 1, 10, 1);
  const interval = clampNumber(args.intervalHours, 0.5, 24 * 30, 1, 1);
  const now = new Date();
  const nextExecuteAt = new Date(now.getTime() + interval * 60 * 60 * 1000);

  const [schedule] = await db
    .insert(resurfaceSchedules)
    .values({
      postId: args.postId,
      platform: "x",
      intervalHours: interval,
      maxResurfaces: capped,
      plugComment: args.plugComment,
      isActive: true,
      resurfacesDone: 0,
      updatedAt: now,
    })
    .returning({ id: resurfaceSchedules.id });
  if (!schedule) return;

  await db.insert(resurfaceEvents).values({
    scheduleId: schedule.id,
    platformReshareId: null,
    plugCommentId: null,
    executedAt: null,
    nextExecuteAt,
    status: "pending",
  });
}

async function trySetupAutoPlug(args: {
  postId: string;
  userId: string;
  metricType: "likes" | "retweets";
  threshold: number;
  plugComment: string;
}): Promise<void> {
  const allowed = await checkAutoPlugAllowed(args.userId);
  if (!allowed) return;

  const [p] = await db
    .select({ id: posts.id, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, args.postId), eq(posts.userId, args.userId)))
    .limit(1);
  if (!p || !LIVE_POST_STATUSES.has(p.status ?? "")) return;

  const xRow = await db
    .select({
      connectedAccountId: postPublications.connectedAccountId,
      platformPostId: postPublications.platformPostId,
      existingAutoPlugId: autoPlugs.id,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .leftJoin(
      autoPlugs,
      and(
        eq(autoPlugs.postId, args.postId),
        eq(autoPlugs.connectedAccountId, postPublications.connectedAccountId),
        inArray(autoPlugs.status, ["watching", "triggered"]),
      ),
    )
    .where(
      and(
        eq(postPublications.postId, args.postId),
        eq(postPublications.status, "published"),
        eq(connectedAccounts.platform, "twitter_x"),
        eq(connectedAccounts.userId, args.userId),
      ),
    )
    .limit(1);

  if (!xRow[0]?.connectedAccountId || !xRow[0].platformPostId) return;
  if (xRow[0].existingAutoPlugId) return;

  const plugComment = coerceTrimmedString(args.plugComment, 280);
  if (!plugComment) return;
  const metricType = args.metricType === "retweets" ? "retweets" : "likes";
  const threshold = clampInt(args.threshold, 1, 10_000_000, 1);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await db.insert(autoPlugs).values({
    postId: args.postId,
    connectedAccountId: xRow[0].connectedAccountId,
    platform: "x",
    metricType,
    metricThreshold: threshold,
    plugComment,
    status: "watching",
    platformPostId: xRow[0].platformPostId,
    plugTweetId: null,
    expiresAt,
    updatedAt: now,
  });
}
