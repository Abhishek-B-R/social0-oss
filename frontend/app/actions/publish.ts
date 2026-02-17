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
import {
  uploadLinkedInImage,
  uploadLinkedInVideo,
} from "@/lib/linkedin-media";

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

/**
 * Core publish logic: fetches post + publications, posts to LinkedIn, updates DB.
 * When userId is provided (e.g. from server action), verifies post belongs to that user.
 * When userId is omitted (e.g. from cron), runs without auth check.
 */
export async function executePublish(
  postId: string,
  userId?: string,
): Promise<PublishResult> {
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
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(eq(postPublications.postId, postId));

  const results: PublishResult["results"] = [];
  let accessToken: string;

  for (const pub of publicationsWithAccounts) {
    if (pub.platform !== "linkedin") {
      results.push({
        platform: pub.platform,
        connectedAccountId: pub.connectedAccountId,
        status: "failed",
        error: "Publishing to this platform is not implemented yet",
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

    const authorUrn = `urn:li:person:${pub.platformUserId}`;

    // Fetch media if post has mediaIds
    let mediaAssets: string[] = [];
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
        const images = media.filter((m) =>
          m.mimeType?.startsWith("image/"),
        );
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
      .catch(() => ({} as Record<string, unknown>));

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

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId)) {
    return {
      success: false,
      error: "Invalid post ID format",
      results: [],
    };
  }

  return executePublish(postId, session.user.id);
}
