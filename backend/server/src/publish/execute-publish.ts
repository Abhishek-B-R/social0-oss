import { db } from "../db/index.js";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
  resurfaceSchedules,
  resurfaceEvents,
  autoPlugs,
} from "../db/schema.js";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { decryptToken } from "../lib/encryption.js";
import {
  uploadLinkedInImage,
  uploadLinkedInVideo,
} from "../lib/linkedin-media.js";
import { publishToPlatform } from "../lib/publish-platform.js";
import {
  isValidPostId,
  validateCollectionMedia,
  getAllowedMediaOrigins,
  isAllowedMediaUrl,
} from "../lib/publish-validation.js";
import { truncateCaptionForPlatform } from "../lib/platform-limits.js";
import { NEVER_EXPIRES_PLATFORMS } from "../lib/token-health.js";
import {
  checkAutoPlugAllowed,
  checkResurfaceAllowed,
  checkTwitterPublishRateLimit,
} from "../lib/plan-limits.js";
import { logPublishBlocked } from "../lib/plan-analytics.js";
import {
  uploadTwitterImage,
  uploadTwitterVideo,
} from "../lib/twitter-media.js";
import { getTwitterErrorMessage } from "../lib/twitter-errors.js";
import { parseTikTokHandleFromProfileUrl } from "../lib/platform-view-url.js";
import { maybeSendPostFailureEmail } from "../lib/post-failure-email.js";
import { TwitterApi } from "twitter-api-v2";

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
      })
      .from(postPublications)
      .innerJoin(
        connectedAccounts,
        eq(postPublications.connectedAccountId, connectedAccounts.id),
      )
      .where(eq(postPublications.postId, postId));
    return list.map((r) => ({
      publicationId: r.publicationId,
      connectedAccountId: r.connectedAccountId,
      platform: r.platform,
      platformUsername: r.platformUsername,
      publicationStatus: r.publicationStatus ?? "pending",
      platformPostUrl: r.platformPostUrl,
      lastError: r.lastError,
    }));
  } catch (err) {
    console.error("[getPostPublicationList] failed, returning empty:", err);
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
): Promise<PublishResult> {
  console.log(
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

  const [post] = await db
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

  if (!post) {
    return {
      success: false,
      error: userId ? "Post not found or access denied" : "Post not found",
      results: [],
    };
  }

  // Free-tier quota is charged once when the user submits the post
  // (createPost / updatePost / updateAndPublish / postAgain) - never here.
  // This function runs multiple times per post (per-platform progress calls,
  // safety-net republish, retries, cron) and must not gate or count quota.

  let publicationsWithAccounts = await db
    .select({
      publicationId: postPublications.id,
      publicationStatus: postPublications.status,
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
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(eq(postPublications.postId, postId));

  if (publicationIdFilter) {
    publicationsWithAccounts = publicationsWithAccounts.filter(
      (p) => p.publicationId === publicationIdFilter,
    );
  }
  if (publicationsWithAccounts.length === 0) {
    return { success: true, results: [] };
  }

  const pendingTwitterCount = publicationsWithAccounts.filter(
    (p) => p.publicationStatus === "pending" && p.platform === "twitter_x",
  ).length;
  if (pendingTwitterCount > 0 && post.userId) {
    const rateLimit = await checkTwitterPublishRateLimit(
      post.userId,
      pendingTwitterCount,
    );
    if (!rateLimit.allowed) {
      logPublishBlocked("twitter_rate_limit", post.userId, post.id);
      const failureReason =
        rateLimit.reason ??
        "You're posting to X too quickly. Please wait a few minutes and try again.";
      await db
        .update(posts)
        .set({
          status: "failed",
          failureReason,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId));
      return {
        success: false,
        error: failureReason,
        results: [],
      };
    }
  }

  // Mark post and pending publications as "publishing" so UI shows progress and we avoid double-publish.
  // Never demote an already published/partial post - follow-up calls on finished publications
  // (per-platform progress, safety-net republish) would otherwise erase the status that
  // marks the post as already counted against the free quota.
  await db
    .update(posts)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(
      and(
        eq(posts.id, postId),
        notInArray(posts.status, ["published", "partial"]),
      ),
    );
  const pendingPublicationIds = publicationsWithAccounts
    .filter((p) => p.publicationStatus === "pending")
    .map((p) => p.publicationId);
  const retryPublicationIds = publicationIdFilter
    ? publicationsWithAccounts
        .filter(
          (p) =>
            p.publicationId === publicationIdFilter &&
            (p.publicationStatus === "failed" ||
              p.publicationStatus === "pending"),
        )
        .map((p) => p.publicationId)
    : [];
  const publishingPublicationIds = [
    ...new Set([...pendingPublicationIds, ...retryPublicationIds]),
  ];
  if (publishingPublicationIds.length > 0) {
    await db
      .update(postPublications)
      .set({ status: "publishing", lastError: null, updatedAt: new Date() })
      .where(inArray(postPublications.id, publishingPublicationIds));
  }

  const results: PublishResult["results"] = [];

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
    // Skip if already in progress (e.g. concurrent request); leave DB as "publishing" for other request to complete
    if (pub.publicationStatus === "publishing") {
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error: "Publish already in progress",
      });
      return;
    }

    // Collection/mixed media: log per-platform warnings (do not fail publish)
    if (effectiveMediaIds?.length) {
      const collectionCheck = validateCollectionMedia(
        effectiveMediaIds,
        pub.platform,
      );
      if (collectionCheck.warning) {
        console.warn(
          `[executePublish] ${pub.platform} collection media:`,
          collectionCheck.warning,
        );
      }
    }

    // YouTube and TikTok use getValidToken during publish which auto-refreshes expired tokens.
    // Skipping the tokenStatus/tokenExpiresAt guards for these platforms lets that refresh run.
    // All other platforms without refresh support still fail fast here.
    const supportsAutoRefresh =
      pub.platform === "youtube" || pub.platform === "tiktok";

    if (
      !supportsAutoRefresh &&
      pub.tokenStatus === "expired" &&
      !NEVER_EXPIRES_PLATFORMS.has(pub.platform)
    ) {
      const tokenExpiredMsg =
        "Token expired - user must reconnect this account";
      await db
        .update(postPublications)
        .set({
          status: "failed",
          lastError: tokenExpiredMsg,
          updatedAt: new Date(),
        })
        .where(eq(postPublications.id, pub.publicationId));
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error: tokenExpiredMsg,
      });
      return;
    }

    // Do not attempt to publish with an expired token (by time).
    // Exception: YouTube, TikTok, and LinkedIn call getValidToken which handles refresh on-demand.
    if (
      pub.tokenExpiresAt &&
      new Date(pub.tokenExpiresAt) < new Date() &&
      pub.platform !== "youtube" &&
      pub.platform !== "tiktok" &&
      pub.platform !== "linkedin"
    ) {
      const tokenExpiredMsg =
        "Token expired - user must reconnect this account";
      await db
        .update(postPublications)
        .set({
          status: "failed",
          lastError: tokenExpiredMsg,
          updatedAt: new Date(),
        })
        .where(eq(postPublications.id, pub.publicationId));
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error: tokenExpiredMsg,
      });
      return;
    }

    try {
      accessToken = decryptToken(
        pub.encryptedAccessToken,
        pub.connectedAccountId,
      );
    } catch (e) {
      console.error("[executePublish] Decrypt token failed:", e);
      const err = e instanceof Error ? e.message : "Failed to decrypt token";
      await db
        .update(postPublications)
        .set({
          status: "failed",
          lastError: err,
          updatedAt: new Date(),
        })
        .where(eq(postPublications.id, pub.publicationId));
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error: err,
      });
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
        console.error("[executePublish] Decrypt Twitter secret failed:", e);
        const err =
          e instanceof Error ? e.message : "Failed to decrypt Twitter secret";
        await db
          .update(postPublications)
          .set({
            status: "failed",
            lastError: err,
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "failed",
          error: err,
        });
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
        console.error("[executePublish] LinkedIn getValidToken failed:", err);
        const errorMsg =
          err instanceof Error ? err.message : "Failed to get valid token";
        await db
          .update(postPublications)
          .set({
            status: "failed",
            lastError: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "failed",
          error: errorMsg,
        });
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
              console.error(
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
                console.error(
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

      const responseData = await linkedInRes
        .json()
        .catch(() => ({}) as Record<string, unknown>);

      if (!linkedInRes.ok) {
        const errMessage = parseLinkedInError(responseData, linkedInRes.status);
        await db
          .update(postPublications)
          .set({
            status: "failed",
            lastError: errMessage,
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "failed",
          error: errMessage,
        });
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
      const client = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      });
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
      const sendTweet = async (
        payload: Parameters<(typeof client.v2)["tweet"]>[0],
      ) => {
        if (!xPostSettings) {
          return client.v2.tweet(payload);
        }
        const payloadWithFlags = {
          ...payload,
          ...(xPostSettings.madeWithAi ? { made_with_ai: true } : {}),
          ...(xPostSettings.paidPartnership ? { paid_partnership: true } : {}),
        } as Parameters<(typeof client.v2)["tweet"]>[0];
        try {
          return await client.v2.tweet(payloadWithFlags);
        } catch (error) {
          if (!isUnsupportedXFlagError(error)) throw error;
          // Graceful fallback in case the connected app tier/endpoint does not support these new fields yet.
          return client.v2.tweet(payload);
        }
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
          await db
            .update(postPublications)
            .set({
              status: "failed",
              lastError: msg,
              updatedAt: new Date(),
            })
            .where(eq(postPublications.id, pub.publicationId));
          results.push({
            platform: pub.platform,
            connectedAccountId: pub.connectedAccountId,
            status: "failed",
            error: msg,
          });
          return;
        }

        // Skip 280 char validation - Premium users can post up to 25k chars.
        // If Twitter rejects, the API error will be surfaced to the user.

        const uniqueDbMediaIds = [...new Set(parts.flatMap((p) => p.mediaIds))];
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
          await db
            .update(postPublications)
            .set({
              status: "failed",
              lastError: msg,
              updatedAt: new Date(),
            })
            .where(eq(postPublications.id, pub.publicationId));
          results.push({
            platform: pub.platform,
            connectedAccountId: pub.connectedAccountId,
            status: "failed",
            error: msg,
          });
          return;
        }

        const missingUrlId = uniqueDbMediaIds.find((id) => {
          const m = mediaByDbId.get(id);
          return m && !m.url;
        });
        if (missingUrlId) {
          const msg = "Media has no URL. Re-upload the media and try again.";
          await db
            .update(postPublications)
            .set({
              status: "failed",
              lastError: msg,
              updatedAt: new Date(),
            })
            .where(eq(postPublications.id, pub.publicationId));
          results.push({
            platform: pub.platform,
            connectedAccountId: pub.connectedAccountId,
            status: "failed",
            error: msg,
          });
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

        try {
          let firstTweetId: string | undefined;
          let previousTweetId: string | undefined;

          for (let i = 0; i < parts.length; i++) {
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

            const tweetData = await sendTweet(
              payload as Parameters<typeof client.v2.tweet>[0],
            );
            const id = tweetData.data?.id;
            if (!id) throw new Error("Twitter did not return tweet ID");
            if (isFirst) firstTweetId = id;
            previousTweetId = id;
          }

          const platformPostUrl =
            firstTweetId != null
              ? `https://twitter.com/${pub.platformUsername || pub.platformUserId}/status/${firstTweetId}`
              : null;

          await db
            .update(postPublications)
            .set({
              status: "published",
              publishedAt: new Date(),
              platformPostId: firstTweetId ?? null,
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
        } catch (e) {
          const errorMessage = getTwitterErrorMessage(e);
          console.error(
            "[executePublish] Twitter post failed:",
            errorMessage,
            e,
          );
          await db
            .update(postPublications)
            .set({
              status: "failed",
              lastError: errorMessage,
              updatedAt: new Date(),
            })
            .where(eq(postPublications.id, pub.publicationId));
          results.push({
            platform: pub.platform,
            connectedAccountId: pub.connectedAccountId,
            status: "failed",
            error: errorMessage,
          });
        }

        return;
      }
      const mediaIds: string[] = [];

      // Fetch media in post order; Twitter supports up to 4 attachments (any mix of images and videos)
      if (effectiveMediaIds && effectiveMediaIds.length > 0) {
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
            console.error("[executePublish] Twitter media upload failed:", e);
            const err =
              e instanceof Error ? e.message : "Failed to upload media";
            await db
              .update(postPublications)
              .set({
                status: "failed",
                lastError: err,
                updatedAt: new Date(),
              })
              .where(eq(postPublications.id, pub.publicationId));
            results.push({
              platform: pub.platform,
              connectedAccountId: pub.connectedAccountId,
              status: "failed",
              error: err,
            });
            twitterUploadFailed = true;
            break;
          }
        }
        if (twitterUploadFailed) return;
      }

      // Twitter thread: split by "---" for native thread (reply chain)
      const rawContent = resolvedContent || "";
      const parts = rawContent
        .split("---")
        .map((p) => p.trim())
        .filter(Boolean);

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

      try {
        let firstTweetId: string | undefined;

        if (parts.length === 1) {
          // Single tweet
          const tweetText = truncateCaptionForPlatform(
            parts[0],
            "twitter_x",
            pub.isTwitterPremium ?? false,
          );
          const payload: {
            text: string;
            media?: { media_ids: MediaIdsTuple };
          } = {
            text: tweetText,
          };
          if (mediaTuple) payload.media = { media_ids: mediaTuple };
          const tweetData = await sendTweet(
            payload as Parameters<typeof client.v2.tweet>[0],
          );
          firstTweetId = tweetData.data?.id ?? undefined;
        } else {
          // Thread: first tweet, then each part as reply to the previous tweet
          let previousTweetId: string | undefined;
          for (let i = 0; i < parts.length; i++) {
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
            const tweetData = await sendTweet(
              payload as Parameters<typeof client.v2.tweet>[0],
            );
            const id = tweetData.data?.id;
            if (!id) throw new Error("Twitter did not return tweet ID");
            if (isFirst) firstTweetId = id;
            previousTweetId = id;
          }
        }

        const platformPostUrl =
          firstTweetId != null
            ? `https://twitter.com/${pub.platformUsername || pub.platformUserId}/status/${firstTweetId}`
            : null;

        await db
          .update(postPublications)
          .set({
            status: "published",
            publishedAt: new Date(),
            platformPostId: firstTweetId ?? null,
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
      } catch (e) {
        const errorMessage = getTwitterErrorMessage(e);
        console.error("[executePublish] Twitter post failed:", errorMessage, e);
        await db
          .update(postPublications)
          .set({
            status: "failed",
            lastError: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "failed",
          error: errorMessage,
        });
      }
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
      if (
        pub.platform === "threads" &&
        pub.tokenExpiresAt &&
        new Date(pub.tokenExpiresAt) <= new Date()
      ) {
        const msg =
          "Your Threads session has expired. Please reconnect Threads from the dashboard.";
        await db
          .update(postPublications)
          .set({ status: "failed", lastError: msg, updatedAt: new Date() })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "failed",
          error: msg,
        });
        return;
      }
      let platformAccessSecret = accessSecret;
      if (pub.platform === "bluesky" && pub.encryptedRefreshToken) {
        try {
          platformAccessSecret = decryptToken(
            pub.encryptedRefreshToken,
            pub.connectedAccountId,
          );
        } catch (e) {
          console.error(
            "[executePublish] Bluesky decrypt app password failed:",
            e,
          );
          const err =
            e instanceof Error
              ? e.message
              : "Failed to decrypt Bluesky app password";
          await db
            .update(postPublications)
            .set({
              status: "failed",
              lastError: err,
              updatedAt: new Date(),
            })
            .where(eq(postPublications.id, pub.publicationId));
          results.push({
            platform: pub.platform,
            connectedAccountId: pub.connectedAccountId,
            status: "failed",
            error: err,
          });
          return;
        }
      }

      let tokenForPublish = accessToken;
      if (pub.platform === "youtube") {
        try {
          const { getValidToken } = await import("@/lib/token-refresh");
          tokenForPublish = await getValidToken(
            pub.connectedAccountId,
            "youtube",
          );
        } catch (err) {
          console.error("[executePublish] YouTube getValidToken failed:", err);
          const errorMsg =
            err instanceof Error ? err.message : "Failed to get valid token";
          await db
            .update(postPublications)
            .set({
              status: "failed",
              lastError: errorMsg,
              updatedAt: new Date(),
            })
            .where(eq(postPublications.id, pub.publicationId));
          results.push({
            platform: pub.platform,
            connectedAccountId: pub.connectedAccountId,
            status: "failed",
            error: errorMsg,
          });
          return;
        }
      } else if (pub.platform === "tiktok") {
        try {
          const { getValidToken } = await import("../lib/token-refresh.js");
          tokenForPublish = await getValidToken(
            pub.connectedAccountId,
            "tiktok",
          );
        } catch (err) {
          console.error("[executePublish] TikTok getValidToken failed:", err);
          const errorMsg =
            err instanceof Error ? err.message : "Failed to get valid token";
          await db
            .update(postPublications)
            .set({
              status: "failed",
              lastError: errorMsg,
              updatedAt: new Date(),
            })
            .where(eq(postPublications.id, pub.publicationId));
          results.push({
            platform: pub.platform,
            connectedAccountId: pub.connectedAccountId,
            status: "failed",
            error: errorMsg,
          });
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
        let platformOptions:
          | { instagram?: { coverImageUrl?: string; isTrialReel: boolean } }
          | undefined;
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
          console.log(
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
        console.log(
          `[${pub.platform}] publishToPlatform result:`,
          JSON.stringify(platformPostResult),
        );
        const isPublished = platformPostResult.status === "published";
        if (platformPostResult.status === "failed") {
          const errMsg =
            platformPostResult.lastError ??
            platformPostResult.error ??
            "Unknown error";
          console.error(
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
            platformPostId: platformPostResult.platformPostId ?? null,
            platformPostUrl: platformPostResult.platformPostUrl ?? null,
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
            await db
              .update(connectedAccounts)
              .set({
                platformUsername: handle,
                platformMetadata: {
                  ...existingMeta,
                  profileUrl: platformPostResult.platformPostUrl,
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
        console.error("[executePublish] publishToPlatform threw:", e);
        const err =
          e instanceof Error ? e.message : "Publish to platform failed";
        await db
          .update(postPublications)
          .set({
            status: "failed",
            lastError: err,
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, pub.publicationId));
        results.push({
          platform: pub.platform,
          connectedAccountId: pub.connectedAccountId,
          status: "failed",
          error: err,
        });
      }
      return;
    }
  }

  const publishTasks = publicationsWithAccounts.map((pub) =>
    handlePublication(pub),
  );

  await Promise.allSettled(publishTasks);

  // Always update post status so we never leave it stuck on "publishing"
  console.log("Publication results:", results);
  console.log(
    "Succeeded:",
    results.filter((r) => r.status === "published").length,
  );
  console.log("Failed:", results.filter((r) => r.status === "failed").length);
  const succeeded = results.filter((r) => r.status === "published").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const failedList = results.filter((r) => r.status === "failed");
  const anyFailed = failed > 0;

  const overallStatus =
    succeeded === 0 ? "failed" : failed === 0 ? "published" : "partial";

  if (!publicationIdFilter) {
    let newPostStatus = post.status;
    if (results.length > 0) {
      newPostStatus = overallStatus;
    }
    if (newPostStatus !== post.status) {
      await db
        .update(posts)
        .set({ status: newPostStatus, updatedAt: new Date() })
        .where(eq(posts.id, postId));
    }

    // Bulk tools: optional auto features for scheduled posts, applied after publish.
    // Do not block publish flow if setup fails.
    if (overallStatus === "published") {
      await setupBulkAutoFeaturesIfPresent({
        postId,
        userId: post.userId,
        metadata: post.metadata,
      });
    }

    if (failedList.length > 0) {
      const failureItems = failedList.map((r) => {
        const pub = publicationsWithAccounts.find(
          (p) => p.connectedAccountId === r.connectedAccountId,
        );
        return {
          platform: r.platform,
          platformUsername: pub?.platformUsername ?? null,
          error: r.error ?? null,
        };
      });
      void maybeSendPostFailureEmail({
        userId: post.userId,
        postId,
        failures: failureItems,
      });
    }
  } else {
    const allPubs = await db
      .select({ status: postPublications.status })
      .from(postPublications)
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

type BulkAutoFeaturesMetadata = {
  bulkAutoFeatures?: {
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
};

async function setupBulkAutoFeaturesIfPresent(args: {
  postId: string;
  userId: string;
  metadata: unknown;
}): Promise<void> {
  const m = (args.metadata ?? null) as BulkAutoFeaturesMetadata | null;
  const features = m?.bulkAutoFeatures;
  if (!features) return;

  const autoRepost = features.autoRepostConfig ?? null;
  const autoPlug = features.autoPlugConfig ?? null;

  if (autoRepost) {
    try {
      await trySetupResurface({
        postId: args.postId,
        userId: args.userId,
        intervalHours: autoRepost.intervalHours,
        maxResurfaces: autoRepost.maxResurfaces,
        plugComment: (autoRepost.plugComment ?? "").trim() || null,
      });
    } catch (e) {
      console.error("[bulk-auto-features] resurface setup failed:", e);
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
      console.error("[bulk-auto-features] auto-plug setup failed:", e);
    }
  }
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
  if (!p || p.status !== "published") return;

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

  const capped = Math.min(Math.max(1, Math.round(args.maxResurfaces)), 10);
  const interval = Math.max(0.5, Math.round(args.intervalHours * 10) / 10);
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
  if (!p || p.status !== "published") return;

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

  const plugComment = (args.plugComment ?? "").trim().slice(0, 280);
  if (!plugComment) return;
  const metricType = args.metricType === "retweets" ? "retweets" : "likes";
  const threshold = Math.max(1, Math.round(args.threshold));

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
