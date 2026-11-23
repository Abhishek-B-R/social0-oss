import { db } from "../db/index.js";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
} from "../db/schema.js";
import { and, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import { decryptToken, INTERRUPTED_PUBLISH_ERROR } from "@social0/shared";
import { idlePublicationSql } from "../lib/stuck-publishing.js";
import { startPublicationHeartbeat } from "../lib/publication-lease.js";
import { rearmPublishOutcomeClaims } from "../lib/post-metadata-claim.js";
import {
  uploadLinkedInImage,
  uploadLinkedInVideo,
} from "../lib/linkedin-media.js";
import { publishToPlatform } from "../lib/publish-platforms/index.js";
import type { PlatformPublishOptions } from "../lib/publish-platforms/types.js";
import {
  isValidPostId,
  validateCollectionMedia,
  getAllowedMediaOrigins,
  isAllowedMediaUrl,
} from "../lib/publish-validation.js";
import { truncateCaptionForPlatform } from "@social0/shared";
import { NEVER_EXPIRES_PLATFORMS } from "../lib/token-health.js";
import {
  uploadTwitterImage,
  uploadTwitterVideo,
} from "../lib/twitter-media.js";
import { getTwitterErrorMessage } from "../lib/twitter-errors.js";
import { buildTikTokProfileUrl, parseTikTokHandleFromProfileUrl } from "../lib/platform-view-url.js";
import {
  createTwitterTweetFetch,
  type CreateTwitterTweetPayload,
} from "../lib/twitter-tweet-fetch.js";
import { publishLog } from "../lib/publish-log.js";
import { ACCOUNT_OVER_PLAN_LIMIT_ERROR } from "../lib/post-account-refs.js";
import {
  partialThreadError,
  readThreadProgress,
  saveThreadProgress,
  threadFingerprint,
} from "../lib/publish-platforms/thread-progress.js";
import {
  collectPostMediaIds,
  ownedMediaIdSet,
  restrictPostMediaIds,
} from "../lib/post-media-refs.js";
import {
  classifyPublicationError,
  type PublicationErrorKind,
} from "../lib/publication-error-kind.js";

/** Extract a readable error from LinkedIn API response (status, message, serviceErrorCode). */
function parseLinkedInError(
  data: Record<string, unknown>,
  fallbackStatus: number,
): string {
  const message = data.message as string | undefined;
  const serviceErrorCode = data.serviceErrorCode as number | undefined;
  const status = data.status as number | undefined;
  const code = data.code as string | undefined;
  const parts: string[] = [];
  if (message) parts.push(message);
  if (code) parts.push(`[${code}]`);
  if (serviceErrorCode != null) parts.push(`(code: ${serviceErrorCode})`);
  if (status != null) parts.push(`HTTP ${status}`);
  if (parts.length) return parts.join(" ");
  return `LinkedIn API error: ${fallbackStatus}`;
}

export type PublishResult = {
  success: boolean;
  error?: string;
  results: {
    platform: string;
    connectedAccountId: string;
    status: "published" | "failed";
    platformPostUrl?: string | null;
    error?: string;
    /**
     * Another live run holds this delivery: this run did not publish it and
     * did not fail it. Job runners must not record it as a platform failure
     * (that would mark the other run's row `failed` mid-upload) and must leave
     * finalizing to the run that owns it.
     */
    inProgressElsewhere?: true;
  }[];
};

/** Runtime-only options at publish time (not persisted to DB). */
export type PublishOptions = {
  instagramConfig?: {
    coverImageUrl?: string;
    isTrialReel: boolean;
  };
  tiktokConfig?: {
    /** When true, let TikTok auto-add recommended music for photo posts. */
    autoAddMusic?: boolean;
  };
};

/**
 * Server-decided controls for one publish run. Never built from client input:
 * `PublishOptions` is what the dashboard sends, this is what the server knows
 * about who is asking.
 */
export type PublishControl = {
  /**
   * A signed-in person asked to retry this specific delivery. Only then may a
   * delivery whose earlier run was interrupted be sent again: that run may
   * have reached the platform, and the person can check before retrying.
   * Automatic re-entries (queue redelivery, cron, an API client calling
   * publish again) leave it alone, so an interruption never turns into a
   * duplicate post on its own.
   */
  takeOverInterrupted?: boolean;
};

/**
 * Returns the list of publications for a post (for progress UI).
 * Caller must be authenticated and own the post.
 */
export async function getPostPublicationList(
  postId: string,
  userId: string,
): Promise<
  {
    publicationId: string;
    connectedAccountId: string;
    platform: string;
    platformUsername: string | null;
    publicationStatus: string;
    platformPostUrl: string | null;
    lastError: string | null;
    /** Which fix to offer for a failed row (same mapping as every other surface). */
    errorKind: PublicationErrorKind | null;
  }[]
> {
  try {
    if (!postId || !isValidPostId(postId) || !userId) return [];
    const [post] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .limit(1);
    if (!post) return [];
    const list = await db
      .select({
        publicationId: postPublications.id,
        connectedAccountId: connectedAccounts.id,
        platform: connectedAccounts.platform,
        platformUsername: connectedAccounts.platformUsername,
        publicationStatus: postPublications.status,
        platformPostUrl: postPublications.platformPostUrl,
        lastError: postPublications.lastError,
        tokenStatus: connectedAccounts.tokenStatus,
      })
      .from(postPublications)
      .innerJoin(
        connectedAccounts,
        eq(postPublications.connectedAccountId, connectedAccounts.id),
      )
      .where(eq(postPublications.postId, postId));
    return list.map((r) => {
      const publicationStatus = r.publicationStatus ?? "pending";
      return {
        publicationId: r.publicationId,
        connectedAccountId: r.connectedAccountId,
        platform: r.platform,
        platformUsername: r.platformUsername,
        publicationStatus,
        platformPostUrl: r.platformPostUrl,
        lastError: r.lastError,
        errorKind: classifyPublicationError({
          error: r.lastError,
          status: publicationStatus,
          tokenStatus: r.tokenStatus,
          platform: r.platform,
        }),
      };
    });
  } catch (err) {
    publishLog.error("[getPostPublicationList] failed, returning empty:", err);
    return [];
  }
}

/**
 * Core publish logic: fetches post + publications, posts to each platform, updates DB.
 * When userId is provided, verifies post belongs to that user.
 * When publicationIdFilter is provided, only that publication is processed (for per-platform progress).
 * options: runtime-only (e.g. instagramConfig) - not persisted.
 */
export async function executePublish(
  postId: string,
  userId?: string,
  publicationIdFilter?: string,
  options?: PublishOptions,
  control: PublishControl = {},
): Promise<PublishResult> {
  publishLog.info(
    "[executePublish] called - options:",
    JSON.stringify(options ?? null),
  );
  if (!postId || !isValidPostId(postId)) {
    return {
      success: false,
      error: "Invalid post ID",
      results: [],
    };
  }
  const postWhere = userId
    ? and(eq(posts.id, postId), eq(posts.userId, userId))
    : eq(posts.id, postId);

  const [loadedPost] = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      finalContent: posts.finalContent,
      status: posts.status,
      mediaIds: posts.mediaIds,
      metadata: posts.metadata,
    })
    .from(posts)
    .where(postWhere)
    .limit(1);

  if (!loadedPost) {
    return {
      success: false,
      error: userId ? "Post not found or access denied" : "Post not found",
      results: [],
    };
  }

  // Media ids come from client-supplied metadata too (thread parts,
  // accountMedia), and every lookup below is by id alone. Keep only the
  // post owner's uploads: a foreign or malformed id is treated like a deleted
  // upload instead of publishing another tenant's file or throwing 22P02.
  const post = restrictPostMediaIds(
    loadedPost,
    await ownedMediaIdSet(
      loadedPost.userId,
      collectPostMediaIds(loadedPost.mediaIds, loadedPost.metadata),
    ),
  );

  // Free-tier quota is charged once when the user submits the post
  // (createPost / updatePost / updateAndPublish / postAgain, and
  // services/publish.ts publishPost on a draft) - never here.
  // This function runs multiple times per post (per-platform progress calls,
  // safety-net republish, retries, cron) and must not gate or count quota.

  let publicationsWithAccounts = await db
    .select({
      publicationId: postPublications.id,
      publicationStatus: postPublications.status,
      publicationLastError: postPublications.lastError,
      platformPostUrl: postPublications.platformPostUrl,
      connectedAccountId: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
      platformUsername: connectedAccounts.platformUsername,
      platformAccountType: connectedAccounts.platformAccountType,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
      tokenExpiresAt: connectedAccounts.tokenExpiresAt,
      tokenStatus: connectedAccounts.tokenStatus,
      platformMetadata: connectedAccounts.platformMetadata,
      isTwitterPremium: connectedAccounts.isTwitterPremium,
      accountIsActive: connectedAccounts.isActive,
      publicationIdle: idlePublicationSql,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    // Match `loadPublicationTargets`: a connection can change owner (Teams
    // workspace moves), and a publication left pointing at someone else's
    // account must not publish. The enqueue path already filtered this out, so
    // without it the inline path would publish rows the queue path skips.
    .where(
      and(
        eq(postPublications.postId, postId),
        eq(connectedAccounts.userId, post.userId),
      ),
    );

  if (publicationIdFilter) {
    publicationsWithAccounts = publicationsWithAccounts.filter(
      (p) => p.publicationId === publicationIdFilter,
    );
  }
  if (publicationsWithAccounts.length === 0) {
    return { success: true, results: [] };
  }

  const results: PublishResult["results"] = [];

  /**
   * Mark one platform's publication failed and record it in this run's results.
   *
   * Fifteen call sites wrote this out, so how a failed publication is persisted
   * was fifteen decisions instead of one. The caller still controls what
   * happens next — most return, some fall through to the next platform.
   *
   * `live` is what is already on the platform: a thread that stopped partway
   * keeps its root post's id and URL, so the row still links to it.
   */
  async function failPublication(
    pub: {
      publicationId: string;
      platform: string;
      connectedAccountId: string;
    },
    error: string,
    live?: { platformPostId: string; platformPostUrl: string | null },
  ): Promise<void> {
    await db
      .update(postPublications)
      .set({
        status: "failed",
        lastError: error,
        ...(live && {
          platformPostId: live.platformPostId,
          platformPostUrl: live.platformPostUrl,
        }),
        updatedAt: new Date(),
      })
      .where(eq(postPublications.id, pub.publicationId));
    results.push({
      platform: pub.platform,
      connectedAccountId: pub.connectedAccountId,
      status: "failed",
      error,
    });
  }
  // Deliveries this run owns: only these are sent to a platform. Everything
  // else is either already published or belongs to another live run.
  const ownedPublicationIds = new Set<string>();

  // Claim the deliveries that are waiting (or failed and being retried). The
  // snapshot above is stale by the time we act on it: two runs for the same
  // publication — a client retrying POST /publish, two Retry clicks, cron vs
  // Publish now — run in parallel isolates and can both read `pending`. The
  // update re-checks the status and returns what it actually flipped, so of
  // two racing runs exactly one gets each row; the loser skips it below as
  // "already in progress" instead of posting the same content twice.
  // (The column is nullable; a null status reads as "pending" everywhere.)
  //
  // A delivery failed as interrupted may already be live on the platform, so
  // only an explicit per-delivery retry by a person claims it (see
  // `PublishControl.takeOverInterrupted`). The SQL re-checks that too, so a
  // row interrupted between our read and our claim is not swept up either.
  const takeOverInterrupted = control.takeOverInterrupted === true;
  const isInterruptedFailure = (p: {
    publicationStatus: string | null;
    publicationLastError: string | null;
  }) =>
    p.publicationStatus === "failed" &&
    p.publicationLastError === INTERRUPTED_PUBLISH_ERROR;
  // Deliveries this run reports as interrupted and leaves alone.
  const interruptedPublicationIds = new Set<string>();
  const claimablePublicationIds = publicationsWithAccounts
    .filter(
      (p) =>
        p.publicationStatus == null ||
        p.publicationStatus === "pending" ||
        p.publicationStatus === "failed",
    )
    .filter((p) => takeOverInterrupted || !isInterruptedFailure(p))
    .map((p) => p.publicationId);
  if (claimablePublicationIds.length > 0) {
    const failedClaimable = takeOverInterrupted
      ? eq(postPublications.status, "failed")
      : and(
          eq(postPublications.status, "failed"),
          or(
            isNull(postPublications.lastError),
            ne(postPublications.lastError, INTERRUPTED_PUBLISH_ERROR),
          ),
        );
    const claimed = await db
      .update(postPublications)
      .set({ status: "publishing", lastError: null, updatedAt: new Date() })
      .where(
        and(
          inArray(postPublications.id, claimablePublicationIds),
          or(
            eq(postPublications.status, "pending"),
            failedClaimable,
            isNull(postPublications.status),
          ),
        ),
      )
      .returning({ id: postPublications.id });
    for (const r of claimed) ownedPublicationIds.add(r.id);
  }
  for (const p of publicationsWithAccounts) {
    if (isInterruptedFailure(p) && !ownedPublicationIds.has(p.publicationId)) {
      interruptedPublicationIds.add(p.publicationId);
    }
  }
  // Deliveries left "publishing" by a run that died: a delivery untouched for
  // `STUCK_PUBLISHING_MINUTES` is not running any more (deploy, PM2 restart, a
  // killed CF isolate). Live runs renew `updatedAt` (`publication-lease.ts`),
  // so idle really means abandoned. The dead run may have reached the platform
  // before it stopped, so sending it again could post twice:
  // - a person retrying this delivery takes it over (the posts list, post
  //   detail and Home show it as failed with a Retry);
  // - every other caller fails it as interrupted and leaves it for a person.
  // Both updates re-check status and idleness, so of two runs racing for the
  // same row only one acts on it; the other still skips it below.
  const idlePublishingIds = publicationsWithAccounts
    .filter((p) => p.publicationStatus === "publishing" && p.publicationIdle)
    .map((p) => p.publicationId);
  if (idlePublishingIds.length > 0 && !takeOverInterrupted) {
    const interrupted = await db
      .update(postPublications)
      .set({
        status: "failed",
        lastError: INTERRUPTED_PUBLISH_ERROR,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(postPublications.id, idlePublishingIds),
          eq(postPublications.status, "publishing"),
          idlePublicationSql,
        ),
      )
      .returning({ id: postPublications.id });
    for (const r of interrupted) interruptedPublicationIds.add(r.id);
    if (interrupted.length > 0) {
      publishLog.warn(
        `[executePublish] ${interrupted.length} interrupted publication(s) for post ${postId} need a person to retry`,
      );
    }
  }
  if (idlePublishingIds.length > 0 && takeOverInterrupted) {
    const reclaimed = await db
      .update(postPublications)
      .set({ status: "publishing", lastError: null, updatedAt: new Date() })
      .where(
        and(
          inArray(postPublications.id, idlePublishingIds),
          eq(postPublications.status, "publishing"),
          idlePublicationSql,
        ),
      )
      .returning({ id: postPublications.id });
    for (const r of reclaimed) ownedPublicationIds.add(r.id);
    if (reclaimed.length > 0) {
      publishLog.warn(
        `[executePublish] reclaimed ${reclaimed.length} idle publishing publication(s) for post ${postId}`,
      );
    }
  }

  // This run starts an attempt on the rows it now owns. If the post already
  // reported an outcome (a Retry after a failure, an edit that recreated the
  // rows), that report covered the previous attempt: re-arm the failure email
  // and publish webhook so this attempt's finalize can report its own. After
  // the row claim on purpose, so a late finalize of the previous attempt sees
  // these rows in flight and stands down. A no-op write on a first attempt.
  // Never fatal: the rows are claimed now, and throwing here would strand
  // them in "publishing"; a missed re-arm only costs this attempt's report.
  if (ownedPublicationIds.size > 0) {
    await rearmPublishOutcomeClaims(postId).catch((e) =>
      publishLog.error("[executePublish] re-arm outcome claims failed:", e),
    );
  }

  /**
   * Fail the deliveries this run claimed but never finished. Conditional on
   * `publishing`, so a row this run already finished keeps its outcome.
   * Returns the ids it failed.
   */
  async function failOwnedStillPublishing(
    error: string,
    publicationIds: string[] = [...ownedPublicationIds],
  ): Promise<Set<string>> {
    if (publicationIds.length === 0) return new Set();
    const failedRows = await db
      .update(postPublications)
      .set({ status: "failed", lastError: error, updatedAt: new Date() })
      .where(
        and(
          inArray(postPublications.id, publicationIds),
          eq(postPublications.status, "publishing"),
        ),
      )
      .returning({ id: postPublications.id });
    return new Set(failedRows.map((r) => r.id));
  }

  // Every delivery left is either done or owned by another live run: this call
  // publishes nothing, so it must not touch the post either. Re-stamping it
  // "publishing" (and its updatedAt) would restart the stuck clock, and the
  // aggregate below would count the other run's rows as failed. A row this run
  // does not own belongs to another run: it either read "publishing" already,
  // or another run claimed it between our read and our claim.
  const inProgressElsewhere = publicationsWithAccounts.some(
    (p) =>
      p.publicationStatus !== "published" &&
      !ownedPublicationIds.has(p.publicationId) &&
      !interruptedPublicationIds.has(p.publicationId),
  );
  const nothingToRun = ownedPublicationIds.size === 0;
  const leavePostAlone = inProgressElsewhere && nothingToRun;

  // Mark the post "publishing" so UI shows progress and we avoid double-publish.
  // Never demote an already published/partial post - follow-up calls on finished publications
  // (per-platform progress, safety-net republish) would otherwise erase the status that
  // marks the post as already counted against the free quota.
  if (!leavePostAlone) {
    try {
      await db
        .update(posts)
        .set({ status: "publishing", updatedAt: new Date() })
        .where(
          and(
            eq(posts.id, postId),
            notInArray(posts.status, ["published", "partial"]),
          ),
        );
    } catch (e) {
      // The rows claimed above are this run's to finish, and nothing else
      // will: runners never demote a "publishing" row, since it may belong
      // to another live run. Fail them here before giving up.
      await failOwnedStillPublishing(
        e instanceof Error ? e.message : "Publish failed",
      ).catch(() => undefined);
      throw e;
    }
  }

  // For thread posts: non-Twitter platforms get clean text (no "---") so FB/Threads/Bluesky show readable content
  const contentForNonTwitter = (() => {
    const md = post.metadata;
    if (!md || typeof md !== "object") return null;
    const tw = (md as Record<string, unknown>)["twitterThread"];
    if (!tw || typeof tw !== "object") return null;
    const partsVal = (tw as Record<string, unknown>)["parts"];
    if (!Array.isArray(partsVal) || partsVal.length === 0) return null;
    const joined = partsVal
      .map((p) =>
        p &&
        typeof p === "object" &&
        typeof (p as Record<string, unknown>).text === "string"
          ? ((p as Record<string, unknown>).text as string).trim()
          : "",
      )
      .filter(Boolean)
      .join("\n\n");
    return joined || null;
  })();

  type PublicationWithAccount = (typeof publicationsWithAccounts)[number];

  async function handlePublication(pub: PublicationWithAccount) {
    let accessToken: string;
    const effectiveMediaIds = (() => {
      const md = post.metadata;
      if (!md || typeof md !== "object") return post.mediaIds;
      const accountMedia = (md as Record<string, unknown>)["accountMedia"];
      if (!accountMedia || typeof accountMedia !== "object") return post.mediaIds;
      const mediaForAccount = (accountMedia as Record<string, unknown>)[
        pub.connectedAccountId
      ];
      const mediaForPlatform = (accountMedia as Record<string, unknown>)[
        pub.platform
      ];
      const value = Array.isArray(mediaForAccount)
        ? mediaForAccount
        : Array.isArray(mediaForPlatform)
          ? mediaForPlatform
          : null;
      if (!value) return post.mediaIds;
      return value.filter((id): id is string => typeof id === "string");
    })();

    if (pub.publicationStatus === "published") {
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "published",
        platformPostUrl: pub.platformPostUrl ?? null,
      });
      return;
    }
    // Interrupted earlier and not taken over: report it, never send it.
    if (interruptedPublicationIds.has(pub.publicationId)) {
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error: INTERRUPTED_PUBLISH_ERROR,
      });
      return;
    }
    // Skip unless this run claimed (or reclaimed) the row above: another run
    // owns it and will finish it, so leave the DB as "publishing" for it. The
    // snapshot status cannot decide this — it was read before the claim.
    if (!ownedPublicationIds.has(pub.publicationId)) {
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error: "Publish already in progress",
        inProgressElsewhere: true,
      });
      return;
    }

    // `syncConnectedAccountsToLimit` turns off the accounts past the plan's
    // connection cap. Posts saved before a downgrade (scheduled, queued, or a
    // retry) still point at them, and this is the one place every runner
    // (CF worker, API, BullMQ) goes through.
    if (pub.accountIsActive === false) {
      await failPublication(pub, ACCOUNT_OVER_PLAN_LIMIT_ERROR);
      return;
    }

    // Collection/mixed media: log per-platform warnings (do not fail publish)
    if (effectiveMediaIds?.length) {
      const collectionCheck = validateCollectionMedia(
        effectiveMediaIds,
        pub.platform,
      );
      if (collectionCheck.warning) {
        publishLog.warn(
          `[executePublish] ${pub.platform} collection media:`,
          collectionCheck.warning,
        );
      }
    }

    // Refreshable platforms call getValidToken during publish — don't fail-fast on
    // stale tokenStatus / calendar expiry; let refresh run (or throw a reconnect error).
    const { REFRESHABLE_PLATFORMS } = await import("../lib/token-refresh.js");
    const supportsAutoRefresh = REFRESHABLE_PLATFORMS.has(pub.platform);

    if (
      !supportsAutoRefresh &&
      pub.tokenStatus === "expired" &&
      !NEVER_EXPIRES_PLATFORMS.has(pub.platform)
    ) {
      const tokenExpiredMsg =
        "Token expired - user must reconnect this account";
      await failPublication(pub, tokenExpiredMsg);
      return;
    }

    // Time-based expiry fail-fast only for non-refreshable platforms.
    if (
      !supportsAutoRefresh &&
      pub.tokenExpiresAt &&
      new Date(pub.tokenExpiresAt) < new Date()
    ) {
      const tokenExpiredMsg =
        "Token expired - user must reconnect this account";
      await failPublication(pub, tokenExpiredMsg);
      return;
    }

    try {
      accessToken = decryptToken(
        pub.encryptedAccessToken,
        pub.connectedAccountId,
      );
    } catch (e) {
      publishLog.error("[executePublish] Decrypt token failed:", e);
      const err = e instanceof Error ? e.message : "Failed to decrypt token";
      await failPublication(pub, err);
      return;
    }

    // Twitter OAuth 1.0a: require access secret as well
    let accessSecret: string | null = null;
    if (pub.platform === "twitter_x") {
      if (!pub.encryptedRefreshToken) {
        await db
          .update(postPublications)
          .set({
            status: "failed",
            lastError:
              "Twitter account missing access secret. Please reconnect the account.",
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "failed",
          error:
            "Twitter account missing access secret. Please reconnect the account.",
        });
        return;
      }
      try {
        accessSecret = decryptToken(
          pub.encryptedRefreshToken,
          pub.connectedAccountId,
        );
      } catch (e) {
        publishLog.error("[executePublish] Decrypt Twitter secret failed:", e);
        const err =
          e instanceof Error ? e.message : "Failed to decrypt Twitter secret";
        await failPublication(pub, err);
        return;
      }
    }

    const baseContent = contentForNonTwitter ?? post.finalContent ?? "";
    const accountCaptions =
      post.metadata && typeof post.metadata === "object"
        ? (post.metadata as Record<string, unknown>).accountCaptions
        : undefined;
    const resolvedContent =
      accountCaptions &&
      typeof accountCaptions === "object" &&
      !Array.isArray(accountCaptions) &&
      typeof (accountCaptions as Record<string, string>)[
        pub.connectedAccountId
      ] === "string"
        ? (accountCaptions as Record<string, string>)[pub.connectedAccountId]
        : baseContent;

    // Handle LinkedIn publishing
    if (pub.platform === "linkedin") {
      // Get fresh token (auto-refreshes if needed)
      let linkedInToken: string;
      try {
        const { getValidToken } = await import("../lib/token-refresh.js");
        linkedInToken = await getValidToken(pub.connectedAccountId, "linkedin");
      } catch (err) {
        publishLog.error("[executePublish] LinkedIn getValidToken failed:", err);
        const errorMsg =
          err instanceof Error ? err.message : "Failed to get valid token";
        await failPublication(pub, errorMsg);
        return;
      }

      const authorUrn =
        pub.platformAccountType === "company"
          ? pub.platformUserId
          : `urn:li:person:${pub.platformUserId}`;

      // Fetch media if post has mediaIds (regular LinkedIn UGC post)
      const mediaAssets: string[] = [];
      let shareMediaCategory: "NONE" | "IMAGE" | "VIDEO" = "NONE";

      if (effectiveMediaIds && effectiveMediaIds.length > 0) {
        const media = await db
          .select({
            id: mediaUploads.id,
            url: mediaUploads.url,
            mimeType: mediaUploads.mimeType,
          })
          .from(mediaUploads)
          .where(inArray(mediaUploads.id, effectiveMediaIds));

        if (media.length > 0) {
          const images = media.filter((m) => m.mimeType?.startsWith("image/"));
          const videos = media.filter((m) => m.mimeType?.startsWith("video/"));

          const videoWithUrl = videos.find((v) => v.url);
          if (videoWithUrl) {
            // LinkedIn supports one video per post
            shareMediaCategory = "VIDEO";
            try {
              const videoUrn = await uploadLinkedInVideo(
                videoWithUrl.url!,
                linkedInToken,
                authorUrn,
              );
              mediaAssets.push(videoUrn);
            } catch (e) {
              publishLog.error(
                "[executePublish] LinkedIn video upload failed:",
                e,
              );
              const err =
                e instanceof Error ? e.message : "Failed to upload video";
              await db
                .update(postPublications)
                .set({
                  status: "failed",
                  lastError: `Video upload failed: ${err}`,
                  updatedAt: new Date(),
                })
                .where(eq(postPublications.id, pub.publicationId));
              results.push({
                platform: pub.platform,
                connectedAccountId: pub.connectedAccountId,
                status: "failed",
                error: `Video upload failed: ${err}`,
              });
              return;
            }
          } else {
            const imagesWithUrl = images.filter((i) => i.url);
            if (imagesWithUrl.length > 0) {
              // LinkedIn supports multiple images (up to 9)
              shareMediaCategory = "IMAGE";
              try {
                for (const img of imagesWithUrl.slice(0, 9)) {
                  const imageUrn = await uploadLinkedInImage(
                    img.url!,
                    linkedInToken,
                    authorUrn,
                  );
                  mediaAssets.push(imageUrn);
                }
              } catch (e) {
                publishLog.error(
                  "[executePublish] LinkedIn image upload failed:",
                  e,
                );
                const err =
                  e instanceof Error ? e.message : "Failed to upload images";
                await db
                  .update(postPublications)
                  .set({
                    status: "failed",
                    lastError: `Image upload failed: ${err}`,
                    updatedAt: new Date(),
                  })
                  .where(eq(postPublications.id, pub.publicationId));
                results.push({
                  platform: pub.platform,
                  connectedAccountId: pub.connectedAccountId,
                  status: "failed",
                  error: `Image upload failed: ${err}`,
                });
                return;
              }
            } else if (images.length > 0) {
              // Post has image media but no URL (e.g. upload failed or legacy)
              await db
                .update(postPublications)
                .set({
                  status: "failed",
                  lastError:
                    "Image has no URL. Re-upload the image and try again.",
                  updatedAt: new Date(),
                })
                .where(eq(postPublications.id, pub.publicationId));
              results.push({
                platform: pub.platform,
                connectedAccountId: pub.connectedAccountId,
                status: "failed",
                error: "Image has no URL. Re-upload and retry.",
              });
              return;
            }
          }
        }
      }

      const linkedInCaption = truncateCaptionForPlatform(
        resolvedContent || "",
        "linkedin",
        false,
      );
      const body: {
        author: string;
        lifecycleState: "PUBLISHED";
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: string };
            shareMediaCategory: "NONE" | "IMAGE" | "VIDEO";
            media?: Array<{ status: "READY"; media: string }>;
          };
        };
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC";
        };
      } = {
        author: authorUrn,
        lifecycleState: "PUBLISHED" as const,
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: linkedInCaption,
            },
            shareMediaCategory,
            ...(mediaAssets.length > 0 && {
              media: mediaAssets.map((asset) => ({
                status: "READY" as const,
                media: asset,
              })),
            }),
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" as const,
        },
      };

      const linkedInRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          Authorization: `Bearer ${linkedInToken}`,
        },
        body: JSON.stringify(body),
      });

      const responseData = (await linkedInRes
        .json()
        .catch(() => ({}))) as Record<string, unknown>;

      if (!linkedInRes.ok) {
        const errMessage = parseLinkedInError(responseData, linkedInRes.status);
        await failPublication(pub, errMessage);
        return;
      }

      const postUrn = (responseData as { id?: string }).id;
      const platformPostUrl = postUrn
        ? `https://www.linkedin.com/feed/update/${postUrn}`
        : null;

      await db
        .update(postPublications)
        .set({
          status: "published",
          publishedAt: new Date(),
          platformPostId: postUrn ?? null,
          platformPostUrl,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(postPublications.id, pub.publicationId));

      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "published",
        platformPostUrl,
      });
      return;
    } else if (pub.platform === "twitter_x") {
      // Handle X/Twitter publishing (OAuth 1.0a: access token + access secret)
      const appKey = process.env.TWITTER_CONSUMER_KEY;
      const appSecret = process.env.TWITTER_CONSUMER_SECRET;
      if (!appKey || !appSecret || !accessSecret) {
        await db
          .update(postPublications)
          .set({
            status: "failed",
            lastError:
              "Twitter OAuth 1.0a not configured or missing access secret",
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "failed",
          error: "Twitter OAuth 1.0a not configured or missing access secret",
        });
        return;
      }
      const xPostSettings = (() => {
        const md = post.metadata;
        if (!md || typeof md !== "object") return null;
        const x = (md as Record<string, unknown>)["x"];
        if (!x || typeof x !== "object") return null;
        const madeWithAi =
          (x as Record<string, unknown>)["madeWithAi"] === true;
        const paidPartnership =
          (x as Record<string, unknown>)["paidPartnership"] === true;
        if (!madeWithAi && !paidPartnership) return null;
        return { madeWithAi, paidPartnership };
      })();
      const isUnsupportedXFlagError = (error: unknown) => {
        const message = getTwitterErrorMessage(error).toLowerCase();
        return (
          message.includes("made_with_ai") ||
          message.includes("paid_partnership") ||
          message.includes("not recognized") ||
          message.includes("unsupported") ||
          message.includes("unknown parameter")
        );
      };
      // Always use fetch + OAuth 1.0a — twitter-api-v2 uses Node https.request,
      // which throws `[unenv] https.request is not implemented yet!` on CF Workers.
      const sendTweet = async (payload: CreateTwitterTweetPayload) => {
        if (!xPostSettings) {
          return createTwitterTweetFetch(payload, accessToken, accessSecret);
        }
        const payloadWithFlags: CreateTwitterTweetPayload = {
          ...payload,
          ...(xPostSettings.madeWithAi ? { made_with_ai: true } : {}),
          ...(xPostSettings.paidPartnership ? { paid_partnership: true } : {}),
        };
        try {
          return await createTwitterTweetFetch(
            payloadWithFlags,
            accessToken,
            accessSecret,
          );
        } catch (error) {
          if (!isUnsupportedXFlagError(error)) throw error;
          // Graceful fallback if the connected app tier does not support these fields yet.
          return createTwitterTweetFetch(payload, accessToken, accessSecret);
        }
      };
      const tweetUrl = (tweetId: string) =>
        `https://twitter.com/${pub.platformUsername || pub.platformUserId}/status/${tweetId}`;
      /**
       * Every part is live. Deliberately outside the send's try/catch: a
       * failed status write here is not a failed post, so it must not be
       * recorded as one with no URL. It rejects the handler instead (the
       * crash path settles the row), and the progress saved after each part
       * lets the next run mark the row published without posting again.
       */
      const markTweetsPublished = async (rootTweetId: string | undefined) => {
        const platformPostUrl = rootTweetId ? tweetUrl(rootTweetId) : null;
        await db
          .update(postPublications)
          .set({
            status: "published",
            publishedAt: new Date(),
            platformPostId: rootTweetId ?? null,
            platformPostUrl,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "published",
          platformPostUrl,
        });
      };

      const twitterThreadMeta = (() => {
        const md = post.metadata;
        if (!md || typeof md !== "object") return null;
        const twitterThread = (md as Record<string, unknown>)["twitterThread"];
        if (!twitterThread || typeof twitterThread !== "object") return null;
        const partsVal = (twitterThread as Record<string, unknown>)["parts"];
        if (!Array.isArray(partsVal) || partsVal.length === 0) return null;

        const parts = partsVal
          .map((p) => {
            if (!p || typeof p !== "object") return null;
            const text = (p as Record<string, unknown>)["text"];
            const mediaIds = (p as Record<string, unknown>)["mediaIds"];
            return {
              text: typeof text === "string" ? text : "",
              mediaIds: Array.isArray(mediaIds)
                ? mediaIds.filter((id): id is string => typeof id === "string")
                : [],
            };
          })
          .filter((p): p is { text: string; mediaIds: string[] } => p !== null);

        return parts.length > 0 ? { parts } : null;
      })();

      if (twitterThreadMeta) {
        const parts = twitterThreadMeta.parts;

        const emptyPart = parts.findIndex(
          (p) => p.text.trim().length === 0 && p.mediaIds.length === 0,
        );
        if (emptyPart !== -1) {
          const msg = `Twitter: Part ${emptyPart + 1} is empty. Add text or media to publish.`;
          await failPublication(pub, msg);
          return;
        }

        // Skip 280 char validation - Premium users can post up to 25k chars.
        // If Twitter rejects, the API error will be surfaced to the user.

        // A previous run that stopped partway left its live parts recorded:
        // continue after them instead of posting the thread again.
        const fingerprint = threadFingerprint(parts);
        const saved = readThreadProgress(
          post.metadata,
          pub.publicationId,
          fingerprint,
          parts.length,
        );
        const startIndex = saved?.posted ?? 0;
        if (saved) {
          publishLog.info(
            `[executePublish] X thread ${pub.publicationId}: ${saved.posted} of ${parts.length} parts already live, continuing`,
          );
        }

        // Only the parts still to post need their media.
        const uniqueDbMediaIds = [
          ...new Set(parts.slice(startIndex).flatMap((p) => p.mediaIds)),
        ];
        const mediaByDbId = new Map<
          string,
          { url: string | null; mimeType: string | null }
        >();
        if (uniqueDbMediaIds.length > 0) {
          const media = await db
            .select({
              id: mediaUploads.id,
              url: mediaUploads.url,
              mimeType: mediaUploads.mimeType,
            })
            .from(mediaUploads)
            .where(inArray(mediaUploads.id, uniqueDbMediaIds));
          for (const m of media) {
            if (
              !m.url ||
              !m.mimeType ||
              !isAllowedMediaUrl(m.url, getAllowedMediaOrigins())
            ) {
              continue;
            }
            mediaByDbId.set(m.id, {
              url: m.url ?? null,
              mimeType: m.mimeType ?? null,
            });
          }
        }

        const missingMediaId = uniqueDbMediaIds.find(
          (id) => !mediaByDbId.has(id),
        );
        if (missingMediaId) {
          const msg =
            "One or more media files are missing. Re-upload and try again.";
          await failPublication(pub, msg);
          return;
        }

        const missingUrlId = uniqueDbMediaIds.find((id) => {
          const m = mediaByDbId.get(id);
          return m && !m.url;
        });
        if (missingUrlId) {
          const msg = "Media has no URL. Re-upload the media and try again.";
          await failPublication(pub, msg);
          return;
        }

        type MediaIdsTuple =
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string];

        const toMediaTuple = (ids: string[]): MediaIdsTuple | undefined => {
          if (ids.length === 1) return [ids[0]];
          if (ids.length === 2) return [ids[0], ids[1]];
          if (ids.length === 3) return [ids[0], ids[1], ids[2]];
          if (ids.length >= 4) return [ids[0], ids[1], ids[2], ids[3]];
          return undefined;
        };

        const twitterMediaIdByDbId = new Map<string, string>();
        const ensureTwitterMediaId = async (dbId: string) => {
          const cached = twitterMediaIdByDbId.get(dbId);
          if (cached) return cached;
          const media = mediaByDbId.get(dbId);
          const url = media?.url;
          if (!url)
            throw new Error("Media has no URL. Re-upload and try again.");

          const twitterMediaId = media.mimeType?.startsWith("video/")
            ? await uploadTwitterVideo(url, accessToken, accessSecret!)
            : await uploadTwitterImage(url, accessToken, accessSecret!);

          twitterMediaIdByDbId.set(dbId, twitterMediaId);
          return twitterMediaId;
        };

        let posted = startIndex;
        let firstTweetId: string | undefined = saved?.rootId;
        let previousTweetId: string | undefined = saved?.lastId;
        try {
          for (let i = startIndex; i < parts.length; i++) {
            const part = parts[i];
            const isFirst = i === 0;

            const orderedMedia = part.mediaIds
              .map((id) => {
                const m = mediaByDbId.get(id);
                return m ? { id, ...m } : null;
              })
              .filter(
                (
                  m,
                ): m is {
                  id: string;
                  url: string | null;
                  mimeType: string | null;
                } => m !== null,
              );

            const videos = orderedMedia.filter((m) =>
              m.mimeType?.startsWith("video/"),
            );
            const images = orderedMedia.filter((m) =>
              m.mimeType?.startsWith("image/"),
            );

            const partTwitterMediaIds: string[] = [];
            if (videos.length > 0) {
              // Twitter supports one video per tweet. If both video+images exist, we prefer video.
              partTwitterMediaIds.push(
                await ensureTwitterMediaId(videos[0].id),
              );
            } else if (images.length > 0) {
              for (const img of images.slice(0, 4)) {
                partTwitterMediaIds.push(await ensureTwitterMediaId(img.id));
              }
            }

            const partText = truncateCaptionForPlatform(
              part.text,
              "twitter_x",
              pub.isTwitterPremium ?? false,
            );
            const mediaTuple = toMediaTuple(partTwitterMediaIds);
            const payload: {
              text: string;
              media?: { media_ids: MediaIdsTuple };
              reply?: { in_reply_to_tweet_id: string };
            } = { text: partText };

            if (mediaTuple) payload.media = { media_ids: mediaTuple };
            if (!isFirst && previousTweetId) {
              payload.reply = { in_reply_to_tweet_id: previousTweetId };
            }

            const tweetData = await sendTweet(payload);
            const id = tweetData.data?.id;
            if (!id) throw new Error("Twitter did not return tweet ID");
            if (isFirst) firstTweetId = id;
            previousTweetId = id;
            posted = i + 1;
            await saveThreadProgress(post.id, pub.publicationId, {
              fingerprint,
              posted,
              rootId: firstTweetId ?? id,
              lastId: id,
            });
          }
        } catch (e) {
          const errorMessage = getTwitterErrorMessage(e);
          publishLog.error(
            "[executePublish] Twitter post failed:",
            errorMessage,
            e,
          );
          await failPublication(
            pub,
            partialThreadError(errorMessage, posted, parts.length),
            firstTweetId
              ? { platformPostId: firstTweetId, platformPostUrl: tweetUrl(firstTweetId) }
              : undefined,
          );
          return;
        }

        await markTweetsPublished(firstTweetId);

        return;
      }
      // Twitter thread: split by "---" for native thread (reply chain)
      const rawContent = resolvedContent || "";
      const parts = rawContent
        .split("---")
        .map((p) => p.trim())
        .filter(Boolean);

      // A single tweet is a one-part chain: its progress is what lets a run
      // whose status write failed be finished without tweeting it again.
      // The post's media rides on part 1 only.
      const fingerprint = threadFingerprint(
        parts.map((text, i) => ({
          text,
          mediaIds: i === 0 ? (effectiveMediaIds ?? []) : [],
        })),
      );
      const saved = readThreadProgress(
        post.metadata,
        pub.publicationId,
        fingerprint,
        parts.length,
      );
      const startIndex = saved?.posted ?? 0;
      if (saved) {
        publishLog.info(
          `[executePublish] X post ${pub.publicationId}: ${saved.posted} of ${parts.length} parts already live, continuing`,
        );
      }

      const mediaIds: string[] = [];

      // Fetch media in post order; Twitter supports up to 4 attachments (any mix of images and videos).
      // Only part 1 carries it, so a run that resumes after part 1 needs none.
      if (startIndex === 0 && effectiveMediaIds && effectiveMediaIds.length > 0) {
        const media = await db
          .select({
            id: mediaUploads.id,
            url: mediaUploads.url,
            mimeType: mediaUploads.mimeType,
          })
          .from(mediaUploads)
          .where(inArray(mediaUploads.id, effectiveMediaIds));

        const order = new Map(effectiveMediaIds.map((id, i) => [id, i]));
        const ordered = media
          .filter((m) => m.url && m.mimeType)
          .filter((m) =>
            isAllowedMediaUrl(m.url!, getAllowedMediaOrigins()),
          )
          .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
          .slice(0, 4) as { id: string; url: string; mimeType: string }[];

        let twitterUploadFailed = false;
        for (const m of ordered) {
          try {
            const twitterMediaId = m.mimeType.startsWith("video/")
              ? await uploadTwitterVideo(m.url, accessToken, accessSecret)
              : await uploadTwitterImage(m.url, accessToken, accessSecret);
            mediaIds.push(twitterMediaId);
          } catch (e) {
            publishLog.error("[executePublish] Twitter media upload failed:", e);
            const err =
              e instanceof Error ? e.message : "Failed to upload media";
            await failPublication(pub, err);
            twitterUploadFailed = true;
            break;
          }
        }
        if (twitterUploadFailed) return;
      }

      if (parts.length === 0) {
        await db
          .update(postPublications)
          .set({
            status: "failed",
            lastError: "Tweet content is empty",
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "failed",
          error: "Tweet content is empty",
        });
        return;
      }

      // Skip 280 char validation - Premium users can post up to 25k chars.
      // If Twitter rejects, the API error will be surfaced to the user.

      type MediaIdsTuple =
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string];
      const mediaTuple =
        mediaIds.length === 1
          ? ([mediaIds[0]] as MediaIdsTuple)
          : mediaIds.length === 2
            ? ([mediaIds[0], mediaIds[1]] as MediaIdsTuple)
            : mediaIds.length === 3
              ? ([mediaIds[0], mediaIds[1], mediaIds[2]] as MediaIdsTuple)
              : mediaIds.length >= 4
                ? ([
                    mediaIds[0],
                    mediaIds[1],
                    mediaIds[2],
                    mediaIds[3],
                  ] as MediaIdsTuple)
                : undefined;

      let posted = startIndex;
      let firstTweetId: string | undefined = saved?.rootId;
      let previousTweetId: string | undefined = saved?.lastId;
      try {
        // Part 1 carries the media; each later part replies to the one before.
        for (let i = startIndex; i < parts.length; i++) {
          const text = truncateCaptionForPlatform(
            parts[i],
            "twitter_x",
            pub.isTwitterPremium ?? false,
          );
          const isFirst = i === 0;
          const payload: {
            text: string;
            media?: { media_ids: MediaIdsTuple };
            reply?: { in_reply_to_tweet_id: string };
          } = { text };
          if (isFirst && mediaTuple) {
            payload.media = { media_ids: mediaTuple };
          }
          if (!isFirst && previousTweetId) {
            payload.reply = { in_reply_to_tweet_id: previousTweetId };
          }
          const tweetData = await sendTweet(payload);
          const id = tweetData.data?.id;
          if (!id) {
            // A lone tweet is live even without an id in the response (it
            // was always recorded published); a thread cannot go on.
            if (parts.length === 1) break;
            throw new Error("Twitter did not return tweet ID");
          }
          if (isFirst) firstTweetId = id;
          previousTweetId = id;
          posted = i + 1;
          await saveThreadProgress(post.id, pub.publicationId, {
            fingerprint,
            posted,
            rootId: firstTweetId ?? id,
            lastId: id,
          });
        }
      } catch (e) {
        const errorMessage = getTwitterErrorMessage(e);
        publishLog.error("[executePublish] Twitter post failed:", errorMessage, e);
        await failPublication(
          pub,
          partialThreadError(errorMessage, posted, parts.length),
          firstTweetId
            ? { platformPostId: firstTweetId, platformPostUrl: tweetUrl(firstTweetId) }
            : undefined,
        );
        return;
      }

      await markTweetsPublished(firstTweetId);
      return;
    } else if (
      pub.platform === "facebook" ||
      pub.platform === "bluesky" ||
      pub.platform === "youtube" ||
      pub.platform === "pinterest" ||
      pub.platform === "instagram" ||
      pub.platform === "tiktok" ||
      pub.platform === "threads"
    ) {
      let platformAccessSecret = accessSecret;
      if (pub.platform === "bluesky" && pub.encryptedRefreshToken) {
        try {
          platformAccessSecret = decryptToken(
            pub.encryptedRefreshToken,
            pub.connectedAccountId,
          );
        } catch (e) {
          publishLog.error(
            "[executePublish] Bluesky decrypt app password failed:",
            e,
          );
          const err =
            e instanceof Error
              ? e.message
              : "Failed to decrypt Bluesky app password";
          await failPublication(pub, err);
          return;
        }
      }

      let tokenForPublish = accessToken;
      if (
        pub.platform === "youtube" ||
        pub.platform === "tiktok" ||
        pub.platform === "instagram" ||
        pub.platform === "threads" ||
        pub.platform === "facebook" ||
        pub.platform === "pinterest"
      ) {
        try {
          const { getValidToken } = await import("../lib/token-refresh.js");
          tokenForPublish = await getValidToken(
            pub.connectedAccountId,
            pub.platform,
          );
        } catch (err) {
          publishLog.error(
            `[executePublish] ${pub.platform} getValidToken failed:`,
            err,
          );
          const errorMsg =
            err instanceof Error ? err.message : "Failed to get valid token";
          await failPublication(pub, errorMsg);
          return;
        }
      }

      // For Pinterest, merge post-level pin settings (board, title, link) into platformMetadata
      let effectivePlatformMetadata = pub.platformMetadata ?? null;
      if (
        pub.platform === "pinterest" &&
        post.metadata &&
        typeof post.metadata === "object"
      ) {
        const pinterestMeta = (post.metadata as Record<string, unknown>)
          .pinterest;
        const accountMeta =
          pinterestMeta &&
          typeof pinterestMeta === "object" &&
          (pinterestMeta as Record<string, unknown>)[pub.connectedAccountId];
        if (accountMeta && typeof accountMeta === "object") {
          effectivePlatformMetadata = {
            ...((effectivePlatformMetadata as Record<string, unknown>) ?? {}),
            ...(accountMeta as Record<string, unknown>),
          };
        }
      }

      try {
        const truncatedContent = truncateCaptionForPlatform(
          resolvedContent ?? "",
          pub.platform,
          pub.isTwitterPremium ?? false,
        );
        let platformOptions: PlatformPublishOptions | undefined;
        if (pub.platform === "tiktok") {
          // Publish-now passes the flag at runtime; scheduled / queued posts
          // carry it in metadata (photo posts only; TikTok ignores it on video).
          const savedAutoAddMusic =
            post.metadata && typeof post.metadata === "object"
              ? (post.metadata as Record<string, unknown>).tiktokAutoAddMusic
              : undefined;
          const autoAddMusic =
            options?.tiktokConfig?.autoAddMusic ??
            (typeof savedAutoAddMusic === "boolean" ? savedAutoAddMusic : undefined);
          if (autoAddMusic !== undefined) {
            platformOptions = { tiktok: { autoAddMusic } };
          }
        }
        if (pub.platform === "instagram") {
          const instagramMeta = (() => {
            const md = post.metadata;
            if (!md || typeof md !== "object") return null;
            const instagram = (md as Record<string, unknown>)["instagram"];
            if (!instagram || typeof instagram !== "object") return null;
            const accountOptions = (instagram as Record<string, unknown>)[
              pub.connectedAccountId
            ];
            return accountOptions && typeof accountOptions === "object"
              ? (accountOptions as Record<string, unknown>)
              : null;
          })();
          // coverImageUrl comes from our own uploadFile() flow - not user-supplied.
          // Instagram fetches the URL (not our server), so SSRF doesn't apply here.
          // We do a basic sanity check: must be a valid https URL.
          let coverImageUrl: string | undefined;
          const rawUrl =
            options?.instagramConfig?.coverImageUrl?.trim() ||
            (typeof instagramMeta?.coverImageUrl === "string"
              ? instagramMeta.coverImageUrl.trim()
              : undefined);
          if (rawUrl) {
            try {
              const parsed = new URL(rawUrl);
              if (parsed.protocol === "https:") coverImageUrl = rawUrl;
            } catch {
              // invalid URL - leave undefined
            }
          }
          publishLog.info(
            "[Instagram cover] coverImageUrl from options:",
            rawUrl,
            "→ accepted:",
            !!coverImageUrl,
          );
          platformOptions = {
            instagram: {
              coverImageUrl,
              isTrialReel:
                options?.instagramConfig?.isTrialReel === true ||
                instagramMeta?.isTrialReel === true,
            },
          };
        }
        const platformPostResult = await publishToPlatform(
          {
            publicationId: pub.publicationId,
            connectedAccountId: pub.connectedAccountId,
            platform: pub.platform,
            platformUserId: pub.platformUserId,
            platformUsername: pub.platformUsername,
            platformMetadata: effectivePlatformMetadata,
          },
          {
            id: post.id,
            finalContent: truncatedContent,
            mediaIds: effectiveMediaIds,
            metadata: post.metadata,
          },
          tokenForPublish,
          platformAccessSecret,
          platformOptions,
        );
        publishLog.info(
          `[${pub.platform}] publishToPlatform result:`,
          JSON.stringify(platformPostResult),
        );
        const isPublished = platformPostResult.status === "published";
        if (platformPostResult.status === "failed") {
          const errMsg =
            platformPostResult.lastError ??
            platformPostResult.error ??
            "Unknown error";
          publishLog.error(
            `[executePublish] ${pub.platform} post failed:`,
            errMsg,
          );
        }
        await db
          .update(postPublications)
          .set({
            status: platformPostResult.status,
            publishedAt: isPublished
              ? (platformPostResult.publishedAt ?? new Date())
              : undefined,
            // A failure that reports no post must not erase one an earlier
            // run left live (a thread that stopped partway keeps its root).
            ...(isPublished || platformPostResult.platformPostId != null
              ? {
                  platformPostId: platformPostResult.platformPostId ?? null,
                  platformPostUrl: platformPostResult.platformPostUrl ?? null,
                }
              : {}),
            lastError: platformPostResult.lastError ?? null,
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        if (
          pub.platform === "tiktok" &&
          isPublished &&
          platformPostResult.platformPostUrl?.includes("tiktok.com/@")
        ) {
          const handle = parseTikTokHandleFromProfileUrl(
            platformPostResult.platformPostUrl,
          );
          if (handle) {
            const existingMeta =
              (pub.platformMetadata as Record<string, unknown> | null) ?? {};
            // Always store the profile URL (not /video/{id}) on the account.
            await db
              .update(connectedAccounts)
              .set({
                platformUsername: handle,
                platformMetadata: {
                  ...existingMeta,
                  profileUrl: buildTikTokProfileUrl(handle),
                },
                updatedAt: new Date(),
              })
              .where(eq(connectedAccounts.id, pub.connectedAccountId));
          }
        }
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: platformPostResult.status,
          platformPostUrl: platformPostResult.platformPostUrl ?? undefined,
          error: platformPostResult.lastError ?? platformPostResult.error,
        });
      } catch (e) {
        publishLog.error("[executePublish] publishToPlatform threw:", e);
        const err =
          e instanceof Error ? e.message : "Publish to platform failed";
        await failPublication(pub, err);
      }
      return;
    }
  }

  // Hold the lease on every delivery this run owns while it uploads, so a
  // slow upload is never mistaken for a dead one and taken over.
  const stopHeartbeat = startPublicationHeartbeat(postId, [
    ...ownedPublicationIds,
  ]);
  let settled: PromiseSettledResult<void>[];
  try {
    settled = await Promise.allSettled(
      publicationsWithAccounts.map((pub) => handlePublication(pub)),
    );
  } finally {
    stopHeartbeat();
  }

  // A delivery whose handler threw before recording an outcome (a failed
  // status write, say) is still "publishing" under this run's claim. Fail it
  // now: no runner will, and it would otherwise sit until the stuck sweep.
  const crashed = settled.flatMap((s, i) =>
    s.status === "rejected"
      ? [{ pub: publicationsWithAccounts[i]!, reason: s.reason as unknown }]
      : [],
  );
  for (const { pub, reason } of crashed) {
    if (!ownedPublicationIds.has(pub.publicationId)) continue;
    const error =
      reason instanceof Error ? reason.message : "Publish to platform failed";
    publishLog.error(`[executePublish] ${pub.platform} handler threw:`, reason);
    const failedIds = await failOwnedStillPublishing(error, [
      pub.publicationId,
    ]).catch(() => new Set<string>());
    if (failedIds.has(pub.publicationId)) {
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error,
      });
    }
  }

  // Always update post status so we never leave it stuck on "publishing"
  publishLog.info("Publication results:", results);
  publishLog.info(
    "Succeeded:",
    results.filter((r) => r.status === "published").length,
  );
  publishLog.info("Failed:", results.filter((r) => r.status === "failed").length);
  const succeeded = results.filter((r) => r.status === "published").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const failedList = results.filter((r) => r.status === "failed");
  const anyFailed = failed > 0;

  const overallStatus =
    succeeded === 0 ? "failed" : failed === 0 ? "published" : "partial";

  // Deliveries another live run holds are neither published nor failed yet.
  const othersStillRunning = results.some((r) => r.inProgressElsewhere);

  if (leavePostAlone) {
    // Nothing ran: the run that owns the in-flight rows finalizes the post.
  } else if (!publicationIdFilter) {
    let newPostStatus = post.status;
    // With another run still uploading, the post is not done: keep it
    // "publishing" and let that run's finalize settle it. Counting its rows
    // as failed showed the post failed (with Retry) mid-upload.
    if (results.length > 0 && !othersStillRunning) {
      newPostStatus = overallStatus;
    }
    if (newPostStatus !== post.status) {
      await db
        .update(posts)
        .set({ status: newPostStatus, updatedAt: new Date() })
        .where(eq(posts.id, postId));
    }

    // Auto-Repost / Auto-Plug (`metadata.bulkAutoFeatures`) are set up by
    // `maybeFinalizePostPublish`, which every publish path runs.
  } else {
    const allPubs = await db
      .select({
        status: postPublications.status,
        platform: connectedAccounts.platform,
        platformUsername: connectedAccounts.platformUsername,
        lastError: postPublications.lastError,
      })
      .from(postPublications)
      .innerJoin(
        connectedAccounts,
        eq(postPublications.connectedAccountId, connectedAccounts.id),
      )
      .where(eq(postPublications.postId, postId));
    if (allPubs.length > 0) {
      const publishedCount = allPubs.filter(
        (p) => p.status === "published",
      ).length;
      const failedCount = allPubs.filter((p) => p.status === "failed").length;
      const pendingCount = allPubs.filter(
        (p) => p.status === "pending" || p.status === "publishing",
      ).length;
      let newPostStatus = post.status;
      if (pendingCount === 0) {
        newPostStatus =
          publishedCount === 0
            ? "failed"
            : failedCount === 0
              ? "published"
              : "partial";
      }
      if (newPostStatus !== post.status) {
        await db
          .update(posts)
          .set({ status: newPostStatus, updatedAt: new Date() })
          .where(eq(posts.id, postId));
      }
    }
  }

  const errorSummary =
    failedList.length > 0
      ? failedList
          .map((r) => `${r.platform}: ${r.error ?? "Unknown error"}`.trim())
          .join(" - ")
      : undefined;

  return {
    success: !anyFailed,
    error: errorSummary,
    results,
  };
}
