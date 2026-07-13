/**
 * Threads (Meta) publish — single posts and reply threads.
 */

import { publishLog } from "@/lib/publish-log";

import { truncate } from "@/lib/publish-validation";
import type { Post, Pub, PublishPlatformResult, ThreadPart } from "./types";
import { sleep } from "./helpers";
import { getMediaWithUrls, getOrderedMediaWithUrls } from "./media";
import { getThreadParts } from "./thread-parts";

/** Build application/x-www-form-urlencoded body. Threads API expects form data, not JSON. */
function threadsFormBody(
  params: Record<string, string | boolean | undefined>,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    p.set(k, typeof v === "boolean" ? (v ? "true" : "false") : v);
  }
  return p.toString();
}

/**
 * Published media id from POST .../threads_publish (Graph JSON).
 * Prefer string ids - large numeric JSON ids can lose precision in JS.
 */
function parseThreadsPublishId(data: unknown): string | null {
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const id = o.id;
  if (typeof id === "string" && id.trim().length > 0) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) {
    return String(Math.trunc(id));
  }
  const nested = o.data;
  if (nested != null && typeof nested === "object") {
    const inner = (nested as Record<string, unknown>).id;
    if (typeof inner === "string" && inner.trim().length > 0)
      return inner.trim();
  }
  return null;
}

/** Threads shortcode charset (+ and _). */
const THREADS_SHORTCODE_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+_";

/**
 * Encode numeric media ID to shortcode (base-64 style, 64-char alphabet).
 * Returns "" if id is invalid or charset is not length 64.
 */
function mediaIdToShortcode(id: string | number, charset: string): string {
  if (charset.length !== 64) return "";
  const idStr =
    typeof id === "number" ? String(Math.floor(id)) : String(id).trim();
  if (!idStr) return "";
  let n: bigint;
  try {
    n = BigInt(idStr);
  } catch {
    return "";
  }
  const zero = BigInt(0);
  const sixtyFour = BigInt(64);
  if (n <= zero) return "";
  let result = "";
  while (n > zero) {
    const remainder = n % sixtyFour;
    result = charset[Number(remainder)] + result;
    n = (n - remainder) / sixtyFour;
  }
  return result;
}

function threadsMediaIdToShortcode(id: string | number): string {
  const s = mediaIdToShortcode(id, THREADS_SHORTCODE_CHARSET);
  return s || "";
}

/**
 * Publish a Threads (Meta) reply-chain thread.
 * Strict sequential flow: create first post → publish → get id →
 * for each next part: create container with reply_to_id = previous published id →
 * publish → get id → wait for publish to complete → repeat.
 * Do NOT create all containers upfront; each step waits for the previous publish.
 */
async function publishThreadsThread(
  pub: Pub,
  parts: ThreadPart[],
  accessToken: string,
): Promise<PublishPlatformResult> {
  const threadsUserId = pub.platformUserId;
  const threadParams = new URLSearchParams({ access_token: accessToken });
  let previousPublishedId: string | null = null;
  let firstPublishedId: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    // Wait for previous publish to be visible before creating the next reply
    // (reply_to_id must be the published post ID from threads_publish, not the container ID)
    if (previousPublishedId && i > 0) {
      await new Promise((r) => setTimeout(r, 15000));
    }

    const part = parts[i];
    const safeText = truncate(part.text, 500);
    const media =
      part.mediaIds.length > 0 ? await getMediaWithUrls(part.mediaIds) : [];
    const images = media.filter((m) => m.mimeType.startsWith("image/"));
    const videos = media.filter((m) => m.mimeType.startsWith("video/"));
    const imageUrl = images[0]?.url;
    const videoUrl = videos[0]?.url;

    // reply_to_id is set only after media fields are chosen, immediately before POST /me/threads
    // (must be the published media id from the previous part's threads_publish, never the container id).
    const body: Record<string, string | boolean> = {};

    if (images.length > 1) {
      // Carousel: create item containers for this part only (not replies; they're children)
      const containerIds: string[] = [];
      for (const img of images.slice(0, 20)) {
        const res = await fetch(
          `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: threadsFormBody({
              media_type: "IMAGE",
              image_url: img.url,
              is_carousel_item: true,
            }),
          },
        );
        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          error?: { message?: string };
        };
        if (!res.ok || !data.id) {
          return {
            status: "failed",
            lastError:
              data.error?.message ?? `Threads thread part ${i + 1} failed`,
            error: "Upload failed",
          };
        }
        containerIds.push(data.id);
      }
      await new Promise((r) => setTimeout(r, 2000));
      body.media_type = "CAROUSEL";
      body.children = containerIds.join(",");
      body.text = safeText;
    } else if (videoUrl) {
      body.media_type = "VIDEO";
      body.video_url = videoUrl;
      body.text = safeText;
    } else if (imageUrl) {
      body.media_type = "IMAGE";
      body.image_url = imageUrl;
      body.text = safeText;
    } else {
      body.media_type = "TEXT";
      body.text = safeText;
    }

    if (i > 0) {
      if (!previousPublishedId) {
        const err = `Threads thread chain broken: missing previous published post id before part ${i + 1}`;
        return {
          status: "failed",
          lastError: err,
          error: "Chain broken",
        };
      }
      body.reply_to_id = previousPublishedId;
    }

    // Step 1: Create container for this part (reply_to_id set above when i > 0).
    // Use /me/threads so reply_to_id is resolved in the token user's context (per Meta docs).
    const createRes = await fetch(
      `https://graph.threads.net/v1.0/me/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: threadsFormBody(body),
      },
    );
    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !createData.id) {
      const errMsg =
        (createData as { error?: { message?: string } }).error?.message ??
        `Threads thread part ${i + 1} failed`;
      publishLog.error("[Threads] Create container failed:", {
        part: i + 1,
        status: createRes.status,
        body: createData,
      })
      return {
        status: "failed",
        lastError: errMsg,
        error: "Create failed",
      };
    }

    // Container ID from step 1 - do NOT use as reply_to_id; only the threads_publish response id is valid.
    const containerId = createData.id;

    // Step 2: Poll container status until FINISHED (Threads API requires container to be ready before publish)
    const maxPollAttempts = 40;
    const pollDelayMs = 3000;
    let pollAttempt = 0;
    for (; pollAttempt < maxPollAttempts; pollAttempt++) {
      await sleep(pollDelayMs);
      const statusRes = await fetch(
        `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&${threadParams.toString()}`,
      );
      if (!statusRes.ok) continue;
      const statusData = (await statusRes.json().catch(() => ({}))) as {
        status?: string;
        error_message?: string;
        error?: { message?: string };
      };
      const status = statusData.status;
      if (status === "FINISHED") break;
      if (status === "ERROR" || status === "EXPIRED") {
        const errMsg =
          statusData.error_message ??
          statusData.error?.message ??
          (status === "EXPIRED"
            ? "Threads media container expired. Try again."
            : "Threads media processing failed.");
        publishLog.error("[Threads] Container not publishable:", {
          part: i + 1,
          status,
          error_message: statusData.error_message,
        })
        return {
          status: "failed",
          lastError: errMsg,
          error: "Container error",
        };
      }
      if (pollAttempt < maxPollAttempts - 1) {
        publishLog.info(`[Threads] Part ${i + 1} container status: ${status ?? "unknown"} (attempt ${pollAttempt + 1}/${maxPollAttempts})`,)
      }
    }
    if (pollAttempt >= maxPollAttempts) {
      const err =
        "Threads media container did not become ready in time. Try again.";
      publishLog.error("[Threads]", err)
      return { status: "failed", lastError: err, error: "Timeout" };
    }

    const publishRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: threadsFormBody({ creation_id: containerId }),
      },
    );
    const publishData = (await publishRes.json().catch(() => ({}))) as {
      id?: string;
      error?: {
        message?: string;
        error_user_msg?: string;
        error_user_title?: string;
      };
    };
    const publishedId = parseThreadsPublishId(publishData);
    if (!publishRes.ok || !publishedId) {
      const err = publishData.error;
      const errMsg =
        err?.error_user_msg ??
        (err?.error_user_title && err?.message
          ? `${err.error_user_title}: ${err.message}`
          : err?.message) ??
        "Threads publish failed";
      publishLog.error("[Threads] Publish failed:", {
        part: i + 1,
        status: publishRes.status,
        body: publishData,
      })
      return {
        status: "failed",
        lastError: errMsg,
        error: "Publish failed",
      };
    }

    // Step 3: next part's reply_to_id must be this published media id, not the container id.
    previousPublishedId = publishedId;
    if (!firstPublishedId) firstPublishedId = publishedId;
    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const rootId = firstPublishedId ?? previousPublishedId;
  const threadShortcode = rootId ? threadsMediaIdToShortcode(rootId) : "";
  const platformPostUrl =
    threadShortcode && pub.platformUsername
      ? `https://www.threads.net/@${pub.platformUsername}/post/${threadShortcode}`
      : pub.platformUsername
        ? `https://www.threads.net/@${pub.platformUsername}`
        : null;
  return {
    status: "published",
    platformPostId: rootId ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

export async function publishToThreads(
  pub: Pub,
  post: Post,
  accessToken: string,
): Promise<PublishPlatformResult> {
  const threadParts = getThreadParts(post);
  if (threadParts && threadParts.length > 0) {
    return await publishThreadsThread(pub, threadParts, accessToken);
  }

  const threadsUserId = pub.platformUserId;
  const text = post.finalContent?.trim() ?? "";
  // Collection/carousel: up to 10 items in order, mixed images and videos
  const orderedMedia = post.mediaIds?.length
    ? (await getOrderedMediaWithUrls(post.mediaIds)).slice(0, 10)
    : [];
  const images = orderedMedia.filter((m) => m.mimeType.startsWith("image/"));
  const videos = orderedMedia.filter((m) => m.mimeType.startsWith("video/"));
  const imageUrl = images[0]?.url;
  const videoUrl = videos[0]?.url;

  const safeText = truncate(text, 500);
  if (orderedMedia.length === 0 && !safeText) {
    return {
      status: "failed",
      lastError: "Threads post must have text, an image, or a video.",
      error: "Content required",
    };
  }

  const threadParams = new URLSearchParams({ access_token: accessToken });
  let creationId: string;
  let isCarousel = false;

  // Handle carousel (multiple items: images and/or videos, up to 10)
  if (orderedMedia.length > 1) {
    publishLog.info(`📸 Creating Threads carousel with ${orderedMedia.length} items (images + videos)...`,)

    const containerIds: string[] = [];

    for (const item of orderedMedia) {
      const isVideo = item.mimeType.startsWith("video/");
      const body: Record<string, string | boolean> = {
        media_type: isVideo ? "VIDEO" : "IMAGE",
        is_carousel_item: true,
        ...(isVideo ? { video_url: item.url } : { image_url: item.url }),
      };

      const itemRes = await fetch(
        `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const itemData = (await itemRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string; code?: number; error_subcode?: number };
      };

      if (itemRes.ok && itemData.id) {
        containerIds.push(itemData.id);
        publishLog.info(`✅ Threads carousel item ${containerIds.length} created: ${itemData.id}`,)

        // If this item is a video, poll until FINISHED before creating next item
        if (isVideo) {
          const maxAttempts = 60;
          const delayMs = 3000;
          let attempts = 0;
          publishLog.info(`⏳ Polling Threads video item ${itemData.id} until FINISHED...`,)
          while (attempts < maxAttempts) {
            const statusRes = await fetch(
              `https://graph.threads.net/v1.0/${itemData.id}?fields=status&${threadParams.toString()}`,
            );
            if (statusRes.ok) {
              const statusData = (await statusRes.json().catch(() => ({}))) as {
                status?: string;
                error?: { message?: string };
              };
              const status = statusData.status;
              publishLog.info(`Threads video item status: ${status ?? "unknown"} (attempt ${attempts + 1}/${maxAttempts})`,)
              if (status === "FINISHED") break;
              if (status === "ERROR") {
                const errMsg =
                  statusData.error?.message ??
                  "Threads video item processing failed";
                return {
                  status: "failed",
                  lastError: errMsg,
                  error: "Threads video processing error",
                };
              }
            }
            await sleep(delayMs);
            attempts++;
          }
          if (attempts >= maxAttempts) {
            const err = `Threads video item did not finish processing within ${maxAttempts * (delayMs / 1000)}s.`;
            publishLog.error("❌", err)
            return { status: "failed", lastError: err, error: "Timeout" };
          }
          publishLog.info("✅ Threads video item finished processing.")
        }
      } else {
        publishLog.error("❌ Failed to create Threads carousel item:",
          itemData.error,)
        return {
          status: "failed",
          lastError:
            itemData.error?.message ??
            "Failed to create Threads carousel item. Please try again.",
          error: "Threads carousel item failed",
        };
      }

      // space out carousel item creation so item IDs stay valid
      await sleep(1000);
    }

    if (containerIds.length === 0) {
      return {
        status: "failed",
        lastError: "Failed to upload carousel items",
        error: "Upload failed",
      };
    }

    // Wait before creating carousel container so items don't expire
    await sleep(8000);

    // Create carousel container
    const carouselRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: containerIds.join(","),
          text: safeText,
        }),
      },
    );

    const carouselData = (await carouselRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };

    if (!carouselRes.ok || !carouselData.id) {
      const err = carouselData.error?.message ?? `HTTP ${carouselRes.status}`;
      publishLog.error("Threads carousel creation failed:", {
        status: carouselRes.status,
        error: carouselData.error,
      })
      return { status: "failed", lastError: err, error: err };
    }

    publishLog.info("✅ Threads carousel container created:", {
      containerId: carouselData.id,
      itemCount: containerIds.length,
    })

    creationId = carouselData.id;
    isCarousel = true;
  } else if (orderedMedia.length === 1 && videoUrl) {
    // Single video
    const createRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "VIDEO",
          video_url: videoUrl,
          text: safeText,
        }),
      },
    );
    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !createData.id) {
      const err = createData.error?.message ?? `HTTP ${createRes.status}`;
      return { status: "failed", lastError: err, error: err };
    }
    creationId = createData.id;
    // Threads recommends waiting for video processing before publishing (at least 30s)
    await new Promise((r) => setTimeout(r, 30000));
  } else if (orderedMedia.length === 1 && imageUrl) {
    // Single image
    const createRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "IMAGE",
          image_url: imageUrl,
          text: safeText,
        }),
      },
    );
    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !createData.id) {
      const err = createData.error?.message ?? `HTTP ${createRes.status}`;
      return { status: "failed", lastError: err, error: err };
    }
    creationId = createData.id;
  } else {
    // Text-only post
    const createRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_type: "TEXT", text: safeText }),
      },
    );
    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !createData.id) {
      const err = createData.error?.message ?? `HTTP ${createRes.status}`;
      return { status: "failed", lastError: err, error: err };
    }
    creationId = createData.id;
  }

  // For carousel containers, poll status until ready before publishing.
  if (isCarousel) {
    let attempts = 0;
    const maxAttempts = 30;
    const delayMs = 3000;

    publishLog.info(`⏳ Polling Threads carousel status for container ${creationId}...`,)

    while (attempts < maxAttempts) {
      const statusRes = await fetch(
        `https://graph.threads.net/v1.0/${creationId}?fields=status&${threadParams.toString()}`,
      );

      if (!statusRes.ok) {
        const errorText = await statusRes.text().catch(() => "Unknown error");
        publishLog.warn(`⚠️ Threads carousel status check failed (attempt ${attempts + 1}/${maxAttempts}): HTTP ${statusRes.status}`,
          errorText,)
      } else {
        const statusData = (await statusRes.json().catch(() => ({}))) as {
          status?: string;
          error?: { message?: string };
        };
        const status = statusData.status;

        publishLog.info(`Threads carousel status: ${status ?? "unknown"} (attempt ${
            attempts + 1
          }/${maxAttempts})`,)

        if (status === "FINISHED" || status === "PUBLISHED") {
          publishLog.info("✅ Threads carousel is ready to publish")
          break;
        }

        if (status === "ERROR") {
          const errMessage =
            statusData.error?.message ??
            "Threads carousel container failed to process.";
          publishLog.error("❌ Threads carousel processing error:", errMessage)
          return {
            status: "failed",
            lastError: errMessage,
            error: "Threads carousel not ready",
          };
        }
      }

      attempts += 1;
      await sleep(delayMs);
    }

    if (attempts >= maxAttempts) {
      const err =
        "Threads carousel container was never ready to publish (timed out after 90s).";
      publishLog.error("❌", err)
      return { status: "failed", lastError: err, error: err };
    }
  } else {
    // Non-carousel posts: small grace delay before publish.
    await sleep(2000);
  }
  const publishRes = await fetch(
    `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish?${threadParams}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: creationId }),
    },
  );
  const publishData = (await publishRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!publishRes.ok) {
    const err = publishData.error?.message ?? `HTTP ${publishRes.status}`;
    return { status: "failed", lastError: err, error: err };
  }
  const publishedSingleId = parseThreadsPublishId(publishData);
  if (!publishedSingleId) {
    return {
      status: "failed",
      lastError: "Threads publish returned no media id",
      error: "Publish failed",
    };
  }
  const threadShortcode = threadsMediaIdToShortcode(publishedSingleId);
  const platformPostUrl =
    threadShortcode && pub.platformUsername
      ? `https://www.threads.net/@${pub.platformUsername}/post/${threadShortcode}`
      : pub.platformUsername
        ? `https://www.threads.net/@${pub.platformUsername}`
        : null;
  return {
    status: "published",
    platformPostId: publishedSingleId,
    platformPostUrl,
    publishedAt: new Date(),
  };
}
