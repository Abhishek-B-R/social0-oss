"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import { uploadLinkedInImage, uploadLinkedInVideo } from "@/lib/linkedin-media";
import { publishToPlatform } from "@/lib/publish-platform";
import { isValidPostId } from "@/lib/publish-validation";
import { uploadTwitterImage, uploadTwitterVideo } from "@/lib/twitter-media";
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

/** Extract a readable error from Twitter/X API response */
function parseTwitterError(
  data: Record<string, unknown>,
  fallbackStatus: number,
): string {
  const title = data.title as string | undefined;
  const detail = data.detail as string | undefined;
  const errors = data.errors as
    | Array<{ message?: string; code?: number }>
    | undefined;
  const parts: string[] = [];
  if (title) parts.push(title);
  if (detail) parts.push(detail);
  if (errors && errors.length > 0) {
    const errorMessages = errors
      .map((e) => e.message || `Error ${e.code || ""}`)
      .join(", ");
    parts.push(errorMessages);
  }
  if (parts.length) return parts.join(" ");
  return `Twitter API error: ${fallbackStatus}`;
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

/**
 * Core publish logic: fetches post + publications, posts to LinkedIn, updates DB.
 * When userId is provided (e.g. from server action), verifies post belongs to that user.
 * When userId is omitted (e.g. from cron), runs without auth check.
 */
export async function executePublish(
  postId: string,
  userId?: string,
): Promise<PublishResult> {
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

  const publicationsWithAccounts = await db
    .select({
      publicationId: postPublications.id,
      publicationStatus: postPublications.status,
      connectedAccountId: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
      platformUsername: connectedAccounts.platformUsername,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
      tokenExpiresAt: connectedAccounts.tokenExpiresAt,
      platformMetadata: connectedAccounts.platformMetadata,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(eq(postPublications.postId, postId));

  // Mark post and pending publications as "publishing" so UI shows progress and we avoid double-publish
  await db
    .update(posts)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(eq(posts.id, postId));
  const pendingPublicationIds = publicationsWithAccounts
    .filter((p) => p.publicationStatus === "pending")
    .map((p) => p.publicationId);
  if (pendingPublicationIds.length > 0) {
    await db
      .update(postPublications)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(inArray(postPublications.id, pendingPublicationIds));
  }

  const results: PublishResult["results"] = [];
  let accessToken: string;

  for (const pub of publicationsWithAccounts) {
    if (pub.platform === "medium") {
      await db
        .update(postPublications)
        .set({
          status: "failed",
          lastError: "Publishing to Medium is not supported yet",
          updatedAt: new Date(),
        })
        .where(eq(postPublications.id, pub.publicationId));
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error: "Publishing to Medium is not supported yet",
      });
      continue;
    }

    if (pub.publicationStatus === "published") {
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "published",
        platformPostUrl: null,
      });
      continue;
    }
    // Skip if already in progress (e.g. concurrent request); leave DB as "publishing" for other request to complete
    if (pub.publicationStatus === "publishing") {
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error: "Publish already in progress",
      });
      continue;
    }

    try {
      accessToken = decryptToken(
        pub.encryptedAccessToken,
        pub.connectedAccountId,
      );
    } catch (e) {
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
      continue;
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
        continue;
      }
      try {
        accessSecret = decryptToken(
          pub.encryptedRefreshToken,
          pub.connectedAccountId,
        );
      } catch (e) {
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
        continue;
      }
    }

    // Handle LinkedIn publishing
    if (pub.platform === "linkedin") {
      const authorUrn = `urn:li:person:${pub.platformUserId}`;

      // Fetch media if post has mediaIds
      const mediaAssets: string[] = [];
      let shareMediaCategory: "NONE" | "IMAGE" | "VIDEO" = "NONE";

      if (post.mediaIds && post.mediaIds.length > 0) {
        const media = await db
          .select({
            id: mediaUploads.id,
            url: mediaUploads.url,
            mimeType: mediaUploads.mimeType,
          })
          .from(mediaUploads)
          .where(inArray(mediaUploads.id, post.mediaIds));

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
                accessToken,
                authorUrn,
              );
              mediaAssets.push(videoUrn);
            } catch (e) {
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
              continue;
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
                    accessToken,
                    authorUrn,
                  );
                  mediaAssets.push(imageUrn);
                }
              } catch (e) {
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
                continue;
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
              continue;
            }
          }
        }
      }

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
              text: post.finalContent || "",
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
          Authorization: `Bearer ${accessToken}`,
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
        continue;
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
        continue;
      }
      const client = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      });
      const mediaIds: string[] = [];

      // Fetch media if post has mediaIds
      if (post.mediaIds && post.mediaIds.length > 0) {
        const media = await db
          .select({
            id: mediaUploads.id,
            url: mediaUploads.url,
            mimeType: mediaUploads.mimeType,
          })
          .from(mediaUploads)
          .where(inArray(mediaUploads.id, post.mediaIds));

        if (media.length > 0) {
          const images = media.filter((m) => m.mimeType?.startsWith("image/"));
          const videos = media.filter((m) => m.mimeType?.startsWith("video/"));

          const videoWithUrl = videos.find((v) => v.url);
          if (videoWithUrl) {
            // Twitter supports one video per tweet
            try {
              const videoMediaId = await uploadTwitterVideo(
                videoWithUrl.url!,
                accessToken,
                accessSecret,
              );
              mediaIds.push(videoMediaId);
            } catch (e) {
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
              continue;
            }
          } else {
            const imagesWithUrl = images.filter((i) => i.url);
            if (imagesWithUrl.length > 0) {
              // Twitter supports up to 4 images per tweet
              try {
                for (const img of imagesWithUrl.slice(0, 4)) {
                  const imageMediaId = await uploadTwitterImage(
                    img.url!,
                    accessToken,
                    accessSecret,
                  );
                  mediaIds.push(imageMediaId);
                }
              } catch (e) {
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
                continue;
              }
            } else if (images.length > 0) {
              // Post has image media but no URL
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
              continue;
            }
          }
        }
      }

      // Twitter thread: split by "---" for native thread (reply chain)
      const TWITTER_MAX_LENGTH = 280;
      const rawContent = post.finalContent || "";
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
        continue;
      }

      // Validate each thread part ≤ 280 characters
      const overLimit = parts.findIndex((p) => p.length > TWITTER_MAX_LENGTH);
      if (overLimit !== -1) {
        const partNum = overLimit + 1;
        const len = parts[overLimit].length;
        const msg = `Twitter: Part ${partNum} is ${len} characters (max ${TWITTER_MAX_LENGTH}). Shorten it to publish.`;
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
        continue;
      }

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
          const payload: {
            text: string;
            media?: { media_ids: MediaIdsTuple };
          } = {
            text: parts[0],
          };
          if (mediaTuple) payload.media = { media_ids: mediaTuple };
          const tweetData = await client.v2.tweet(
            payload as Parameters<typeof client.v2.tweet>[0],
          );
          firstTweetId = tweetData.data?.id ?? undefined;
        } else {
          // Thread: first tweet, then each part as reply to the previous tweet
          let previousTweetId: string | undefined;
          for (let i = 0; i < parts.length; i++) {
            const text = parts[i];
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
            const tweetData = await client.v2.tweet(
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
        const err = e instanceof Error ? e.message : "Failed to post tweet";
        let errorMessage = err;
        if (e && typeof e === "object" && "data" in e) {
          const errorData = e.data as Record<string, unknown>;
          errorMessage = parseTwitterError(errorData, 500);
        }
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
    } else if (
      pub.platform === "facebook" ||
      pub.platform === "bluesky" ||
      pub.platform === "hashnode" ||
      pub.platform === "youtube" ||
      pub.platform === "pinterest" ||
      pub.platform === "instagram" ||
      pub.platform === "tiktok" ||
      pub.platform === "threads" ||
      pub.platform === "devto"
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
        continue;
      }
      let platformAccessSecret = accessSecret;
      if (pub.platform === "bluesky" && pub.encryptedRefreshToken) {
        try {
          platformAccessSecret = decryptToken(
            pub.encryptedRefreshToken,
            pub.connectedAccountId,
          );
        } catch (e) {
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
          continue;
        }
      }
      const platformPostResult = await publishToPlatform(
        {
          publicationId: pub.publicationId,
          connectedAccountId: pub.connectedAccountId,
          platform: pub.platform,
          platformUserId: pub.platformUserId,
          platformUsername: pub.platformUsername,
          platformMetadata: pub.platformMetadata ?? null,
        },
        {
          id: post.id,
          finalContent: post.finalContent,
          mediaIds: post.mediaIds,
          metadata: post.metadata,
        },
        accessToken,
        platformAccessSecret,
      );
      await db
        .update(postPublications)
        .set({
          status: platformPostResult.status,
          publishedAt: platformPostResult.publishedAt ?? undefined,
          platformPostId: platformPostResult.platformPostId ?? undefined,
          platformPostUrl: platformPostResult.platformPostUrl ?? undefined,
          lastError: platformPostResult.lastError ?? null,
          updatedAt: new Date(),
        })
        .where(eq(postPublications.id, pub.publicationId));
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: platformPostResult.status,
        platformPostUrl: platformPostResult.platformPostUrl ?? undefined,
        error: platformPostResult.error,
      });
    }
  }

  const allPublished = results.every((r) => r.status === "published");
  const anyFailed = results.some((r) => r.status === "failed");
  const newPostStatus = anyFailed
    ? "failed"
    : allPublished
      ? "published"
      : post.status;
  if (newPostStatus !== post.status) {
    await db
      .update(posts)
      .set({ status: newPostStatus, updatedAt: new Date() })
      .where(eq(posts.id, postId));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/posts");

  return {
    success: !anyFailed,
    results,
  };
}

/**
 * Server action: publishes a post to selected LinkedIn accounts.
 * Verifies the current user owns the post.
 */
export async function publishPost(postId: string): Promise<PublishResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return {
      success: false,
      error: "Unauthorized",
      results: [],
    };
  }

  if (!isValidPostId(postId)) {
    return {
      success: false,
      error: "Invalid post ID format",
      results: [],
    };
  }

  return executePublish(postId, session.user.id);
}
