/**
 * Instagram Graph API publish (feed, carousel, reels).
 */

import { publishLog } from "@/lib/publish-log";

import { truncate } from "@/lib/publish-validation";
import { resolveInstagramProfileUrl } from "@/lib/platform-view-url";
import type { Post, Pub, PublishPlatformResult } from "./types";
import { sleep } from "./helpers";
import { getOrderedMediaWithUrls } from "./media";

export async function publishToInstagram(
  pub: Pub,
  post: Post,
  accessToken: string,
  instagramOptions?: { coverImageUrl?: string; isTrialReel: boolean },
): Promise<PublishPlatformResult> {
  const igUserId = pub.platformUserId;
  publishLog.info("🔍 Instagram publish attempt:", {
    igUserId,
    tokenPrefix: accessToken.substring(0, 30),
  });
  const caption = truncate(post.finalContent?.trim() ?? "", 2200);
  // Collection/carousel: up to 10 items in order, mixed images and videos
  const orderedMedia = post.mediaIds?.length
    ? (await getOrderedMediaWithUrls(post.mediaIds)).slice(0, 10)
    : [];
  const images = orderedMedia.filter((m) => m.mimeType.startsWith("image/"));
  const videos = orderedMedia.filter((m) => m.mimeType.startsWith("video/"));
  const imageUrl = images[0]?.url;
  const videoUrl = videos[0]?.url;
  const isCarousel = orderedMedia.length > 1;

  if (orderedMedia.length === 0) {
    const hint = post.mediaIds?.length
      ? "Upload media through this app; external URLs are not allowed."
      : "Instagram requires at least one image or video.";
    return { status: "failed", lastError: hint, error: "No media" };
  }

  let containerData: {
    id?: string;
    error?: { message?: string; type?: string; code?: number };
  };

  // Handle carousel (multiple items: images and/or videos, up to 10)
  if (orderedMedia.length > 1) {
    publishLog.info(`📸 Creating Instagram carousel with ${orderedMedia.length} items (images + videos)...`,);

    const createdItems: { id: string; isVideo: boolean }[] = [];

    for (let i = 0; i < orderedMedia.length; i++) {
      const item = orderedMedia[i];
      const isVideo = item.mimeType.startsWith("video/");
      publishLog.info("Instagram carousel item",
        i,
        "mimeType:",
        item.mimeType,
        "isVideo:",
        isVideo,);
      const body: Record<string, string | boolean> = {
        is_carousel_item: true,
        media_type: isVideo ? "VIDEO" : "IMAGE",
        ...(isVideo ? { video_url: item.url } : { image_url: item.url }),
      };

      const itemRes = await fetch(
        `https://graph.instagram.com/v21.0/${igUserId}/media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        },
      );

      const itemData = (await itemRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };

      if (itemRes.ok && itemData.id) {
        createdItems.push({ id: itemData.id, isVideo });
        publishLog.info(`✅ Carousel item ${createdItems.length} created: ${itemData.id}`,);
      } else {
        publishLog.error(`❌ Failed to create carousel item:`, itemData.error);
      }
    }

    if (createdItems.length === 0) {
      return {
        status: "failed",
        lastError: "Failed to upload carousel items",
        error: "Upload failed",
      };
    }

    // Second pass: wait for ALL video items to finish processing before creating container
    const videoItemIds = createdItems.filter((x) => x.isVideo).map((x) => x.id);
    if (videoItemIds.length > 0) {
      publishLog.info(`⏳ Polling ${videoItemIds.length} Instagram video item(s) until FINISHED before container...`,);
      const maxAttempts = 60;
      const delayMs = 3000;

      for (const itemId of videoItemIds) {
        let attempts = 0;
        while (attempts < maxAttempts) {
          const statusRes = await fetch(
            `https://graph.instagram.com/v21.0/${itemId}?fields=status_code`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (statusRes.ok) {
            const statusData = (await statusRes.json()) as {
              status_code?: string;
              error?: { message?: string };
            };
            const statusCode = statusData.status_code;
            publishLog.info(`Instagram video item ${itemId} status: ${statusCode ?? "unknown"} (attempt ${attempts + 1}/${maxAttempts})`,);
            if (statusCode === "FINISHED") break;
            if (statusCode === "ERROR") {
              const errMsg =
                statusData.error?.message ?? "Video item processing failed";
              return {
                status: "failed",
                lastError: errMsg,
                error: "Instagram video processing error",
              };
            }
          }
          await sleep(delayMs);
          attempts++;
        }
        if (attempts >= maxAttempts) {
          const err = `Instagram video item ${itemId} did not finish processing within ${maxAttempts * (delayMs / 1000)}s.`;
          publishLog.error("❌", err);
          return { status: "failed", lastError: err, error: "Timeout" };
        }
      }
      publishLog.info("✅ All Instagram video carousel items finished processing.");
    }

    // Wait for items to settle before creating container
    await sleep(8000);

    const containerIds = createdItems.map((x) => x.id);

    // Create carousel container
    const carouselRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: containerIds.join(","),
          caption: caption || undefined,
        }),
      },
    );

    const carouselData = (await carouselRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };

    if (!carouselRes.ok || !carouselData.id) {
      const err = carouselData.error?.message ?? `HTTP ${carouselRes.status}`;
      publishLog.error("Instagram carousel creation failed:", {
        status: carouselRes.status,
        error: carouselData.error,
      });
      return { status: "failed", lastError: err, error: err };
    }

    publishLog.info("✅ Instagram carousel container created:", {
      containerId: carouselData.id,
      itemCount: containerIds.length,
    });

    containerData = carouselData;
  } else if (orderedMedia.length === 1 && imageUrl) {
    // Single image
    const containerBody: {
      caption?: string;
      image_url?: string;
    } = {
      image_url: imageUrl,
      caption: caption || undefined,
    };

    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(containerBody),
      },
    );

    containerData = (await containerRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string; type?: string; code?: number };
    };

    if (!containerRes.ok || !containerData.id) {
      const err = containerData.error?.message ?? `HTTP ${containerRes.status}`;
      publishLog.error("Instagram container creation failed:", {
        status: containerRes.status,
        error: containerData.error,
        body: containerBody,
        response: containerData,
      });
      return { status: "failed", lastError: err, error: err };
    }

    publishLog.info("✅ Instagram container created:", {
      containerId: containerData.id,
      mediaType: "image",
    });
  } else if (orderedMedia.length === 1 && videoUrl) {
    // Single video (Reels)
    const containerBody: {
      caption?: string;
      video_url?: string;
      media_type?: string;
      cover_url?: string;
      share_to_feed?: boolean;
    } = {
      video_url: videoUrl,
      media_type: "REELS", // Videos must be posted as Reels
      caption: caption || undefined,
    };
    if (instagramOptions?.coverImageUrl) {
      containerBody.cover_url = instagramOptions.coverImageUrl;
    }
    if (instagramOptions?.isTrialReel === true) {
      containerBody.share_to_feed = false; // Trial reel: test with non-followers first
    }

    publishLog.info("[Instagram Reels] Container creation request body:", {
      ...containerBody,
      cover_url: containerBody.cover_url
        ? `${containerBody.cover_url.slice(0, 60)}...`
        : undefined,
    });

    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(containerBody),
      },
    );

    const rawContainerJson = await containerRes.json().catch(() => ({}));
    containerData = rawContainerJson as {
      id?: string;
      error?: { message?: string; type?: string; code?: number };
    };

    if (!containerRes.ok || !containerData.id) {
      const err = containerData.error?.message ?? `HTTP ${containerRes.status}`;
      publishLog.error("Instagram container creation failed:", {
        status: containerRes.status,
        error: containerData.error,
        body: containerBody,
        response: containerData,
      });
      return { status: "failed", lastError: err, error: err };
    }

    if (containerData.error) {
      publishLog.warn("[Instagram Reels] Container response included error/warning:",
        containerData.error,);
    }
    publishLog.info("✅ Instagram container created:", {
      containerId: containerData.id,
      mediaType: "video",
      hadCoverUrl: !!containerBody.cover_url,
      responseKeys: Object.keys(rawContainerJson),
    });
  } else {
    return {
      status: "failed",
      lastError: "Instagram requires at least one image or video",
      error: "No media",
    };
  }

  // Step 2: Wait for media processing
  // For single videos: poll container until FINISHED.
  // For carousels: poll the carousel container itself until FINISHED.
  if (videoUrl && images.length === 0) {
    // Poll container status for videos
    let retries = 0;
    const maxRetries = 60; // 60 seconds max

    publishLog.info("⏳ Starting video processing status polling...");

    while (retries < maxRetries) {
      const statusRes = await fetch(
        `https://graph.instagram.com/v21.0/${containerData.id}?fields=status_code`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as {
          status_code?: string;
          error?: { message?: string };
        };

        const statusCode = statusData.status_code;

        publishLog.info(`Instagram video processing status: ${statusCode ?? "unknown"} (attempt ${retries + 1}/${maxRetries})`,);

        if (statusCode === "FINISHED") {
          publishLog.info("✅ Video processing completed, ready to publish");
          break; // Ready to publish
        }

        if (statusCode === "ERROR") {
          const errorMsg =
            statusData.error?.message ?? "Video processing failed on Instagram";
          publishLog.error("❌ Instagram video processing error:", errorMsg);
          return {
            status: "failed",
            lastError: errorMsg,
            error: "Processing error",
          };
        }

        // Handle other status codes (IN_PROGRESS, etc.)
        if (
          statusCode &&
          !["IN_PROGRESS", "FINISHED", "ERROR"].includes(statusCode)
        ) {
          publishLog.warn(`⚠️ Unknown status code: ${statusCode}`);
        }
      } else {
        // Handle status check API errors
        const errorText = await statusRes.text().catch(() => "Unknown error");
        const isPermanentError =
          statusRes.status === 404 || statusRes.status === 401;

        if (isPermanentError) {
          publishLog.error(`❌ Status check failed with permanent error (attempt ${retries + 1}): HTTP ${statusRes.status}`,
            errorText,);
          return {
            status: "failed",
            lastError: `Instagram API error: ${errorText || `HTTP ${statusRes.status}`}`,
            error: "Status check failed",
          };
        }

        // Log transient errors but continue polling
        publishLog.warn(`⚠️ Status check failed (attempt ${retries + 1}): HTTP ${statusRes.status}`,
          errorText,);
      }

      await new Promise((r) => setTimeout(r, 2000)); // Wait 2 seconds between checks
      retries++;
    }

    if (retries >= maxRetries) {
      publishLog.error(`❌ Video processing timeout after ${maxRetries} attempts (${maxRetries * 2}s)`,);
      return {
        status: "failed",
        lastError: "Video processing timeout (120s). Try a shorter video.",
        error: "Timeout",
      };
    }
  } else if (isCarousel && containerData.id) {
    // Poll carousel container status before publishing
    const maxAttempts = 30;
    const delayMs = 3000;
    let attempts = 0;

    publishLog.info(`⏳ Polling Instagram carousel container ${containerData.id} until FINISHED...`,);

    while (attempts < maxAttempts) {
      const statusRes = await fetch(
        `https://graph.instagram.com/v21.0/${containerData.id}?fields=status_code`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (statusRes.ok) {
        const statusData = (await statusRes.json().catch(() => ({}))) as {
          status_code?: string;
          error?: { message?: string };
        };
        const statusCode = statusData.status_code;

        publishLog.info(`Instagram carousel container status: ${statusCode ?? "unknown"} (attempt ${
            attempts + 1
          }/${maxAttempts})`,);

        if (statusCode === "FINISHED") {
          publishLog.info("✅ Instagram carousel container finished processing");
          break;
        }

        if (statusCode === "ERROR") {
          const errorMsg =
            statusData.error?.message ??
            "Instagram carousel container processing failed";
          publishLog.error("❌ Instagram carousel container error:", errorMsg);
          return {
            status: "failed",
            lastError: errorMsg,
            error: "Processing error",
          };
        }
      } else {
        const errorText = await statusRes.text().catch(() => "Unknown error");
        publishLog.warn(`⚠️ Instagram carousel status check failed (attempt ${
            attempts + 1
          }/${maxAttempts}): HTTP ${statusRes.status}`,
          errorText,);
      }

      attempts += 1;
      await sleep(delayMs);
    }

    if (attempts >= maxAttempts) {
      const err =
        "Instagram carousel container did not finish processing in time";
      publishLog.error("❌", err);
      return { status: "failed", lastError: err, error: err };
    }
  } else {
    // Images-only, non-carousel posts process quickly
    publishLog.info("⏳ Waiting 3s for image processing...");
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Step 3: Publish the container
  publishLog.info("📤 Publishing Instagram container...");
  const publishRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ creation_id: containerData.id }),
    },
  );

  const publishData = (await publishRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!publishRes.ok) {
    const err = publishData.error?.message ?? `HTTP ${publishRes.status}`;
    publishLog.error("❌ Instagram publish failed:", {
      status: publishRes.status,
      error: publishData.error,
      response: publishData,
    });
    return { status: "failed", lastError: err, error: err };
  }

  const profileFallback =
    resolveInstagramProfileUrl({
      platformUsername: pub.platformUsername,
      platformUserId: pub.platformUserId,
    }) ?? null;

  // Graph media ids are not URL shortcodes. Fetch `permalink` via Graph API after
  // media_publish; never fail a live post if the cosmetic lookup fails.
  const platformPostUrl = publishData.id
    ? await fetchInstagramPermalink(publishData.id, accessToken, profileFallback)
    : profileFallback;

  publishLog.info("✅ Instagram post published successfully:", {
    postId: publishData.id,
    url: platformPostUrl,
  });

  return {
    status: "published",
    platformPostId: publishData.id ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

/**
 * Instagram Graph returns the public /p/ or /reel/ URL as `permalink`.
 * Cosmetic only — swallow errors so we never re-publish a live post.
 */
async function fetchInstagramPermalink(
  mediaId: string,
  accessToken: string,
  fallback: string | null,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${encodeURIComponent(mediaId)}?fields=permalink`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return fallback;
    const data = (await res.json().catch(() => ({}))) as {
      permalink?: string;
    };
    const permalink = data.permalink?.trim();
    if (permalink && /^https:\/\//i.test(permalink)) return permalink;
  } catch (err) {
    publishLog.warn("Instagram permalink fetch failed (using profile fallback):", err);
  }
  return fallback;
}
