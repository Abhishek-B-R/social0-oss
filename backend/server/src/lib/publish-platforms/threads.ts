/**
 * Threads (Meta) publish - single posts and reply threads.
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

type ThreadsGraphError = {
  message?: string;
  error_user_msg?: string;
  error_user_title?: string;
  error_message?: string;
};

/** Prefer Meta's user-facing copy over opaque Graph codes. */
function threadsErrorMessage(data: unknown, fallback: string): string {
  if (data == null || typeof data !== "object") return fallback;
  const o = data as Record<string, unknown>;
  const nested =
    o.error != null && typeof o.error === "object"
      ? (o.error as ThreadsGraphError)
      : (o as ThreadsGraphError);
  const userMsg = nested.error_user_msg?.trim();
  if (userMsg) return userMsg;
  const title = nested.error_user_title?.trim();
  const msg =
    nested.error_message?.trim() ||
    nested.message?.trim() ||
    (typeof o.error_message === "string" ? o.error_message.trim() : "");
  if (title && msg) return `${title}: ${msg}`;
  if (msg) return msg;
  if (title) return title;
  return fallback;
}

function threadsFail(
  lastError: string,
  error = lastError,
): PublishPlatformResult {
  return { status: "failed", lastError, error };
}

async function postThreadsForm(
  url: string,
  body: Record<string, string | boolean | undefined>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: threadsFormBody(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
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

/**
 * Threads will reject threads_publish until the container is FINISHED.
 * Videos often take well over 30s - never publish on a blind sleep.
 */
async function pollThreadsContainer(opts: {
  containerId: string;
  accessToken: string;
  label: string;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<{ ok: true } | { ok: false; lastError: string; error: string }> {
  const {
    containerId,
    accessToken,
    label,
    maxAttempts = 60,
    delayMs = 3000,
  } = opts;
  const params = new URLSearchParams({ access_token: accessToken });
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(delayMs);
    const statusRes = await fetch(
      `https://graph.threads.net/v1.0/${encodeURIComponent(containerId)}?fields=status,error_message&${params}`,
    );
    if (!statusRes.ok) {
      publishLog.warn(
        `[Threads] ${label} status check failed (attempt ${attempt + 1}/${maxAttempts}): HTTP ${statusRes.status}`,
      );
      continue;
    }
    const statusData = (await statusRes.json().catch(() => ({}))) as {
      status?: string;
      error_message?: string;
      error?: { message?: string };
    };
    const status = statusData.status;
    if (status === "FINISHED" || status === "PUBLISHED") return { ok: true };
    if (status === "ERROR" || status === "EXPIRED") {
      const errMsg = threadsErrorMessage(
        statusData,
        status === "EXPIRED"
          ? "Threads media container expired. Try again."
          : "Threads media processing failed. Check the video format (MP4) and try again.",
      );
      publishLog.error("[Threads] Container not publishable:", {
        label,
        status,
        error_message: statusData.error_message,
      });
      return { ok: false, lastError: errMsg, error: "Container error" };
    }
    publishLog.info(
      `[Threads] ${label} status: ${status ?? "unknown"} (attempt ${attempt + 1}/${maxAttempts})`,
    );
  }
  return {
    ok: false,
    lastError: `Threads media did not become ready in time (${label}). Try a shorter video, or try again.`,
    error: "Timeout",
  };
}

/**
 * Fetch permalink via GET /{threadId}?fields=id,permalink — never invent shortcodes.
 * Cosmetic only; never fail a live Threads publish over permalink lookup.
 */
async function fetchThreadsPermalink(
  threadId: string,
  accessToken: string,
  fallbackProfileUrl: string | null,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      fields: "id,permalink",
      access_token: accessToken,
    });
    const res = await fetch(
      `https://graph.threads.net/v1.0/${encodeURIComponent(threadId)}?${params}`,
    );
    if (!res.ok) return fallbackProfileUrl;
    const data = (await res.json().catch(() => ({}))) as {
      permalink?: string;
    };
    const permalink = data.permalink?.trim();
    if (permalink && /^https:\/\//i.test(permalink)) return permalink;
  } catch (err) {
    publishLog.warn("Threads permalink fetch failed (using profile fallback):", err);
  }
  return fallbackProfileUrl;
}

function threadsProfileFallback(pub: Pub): string | null {
  return pub.platformUsername
    ? `https://www.threads.net/@${pub.platformUsername.replace(/^@/, "")}`
    : null;
}

/**
 * Publish a Threads (Meta) reply-chain thread.
 * Strict sequential flow: create first post -> publish -> get id ->
 * for each next part: create container with reply_to_id = previous published id ->
 * publish -> get id -> wait for publish to complete -> repeat.
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
        const item = await postThreadsForm(
          `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
          {
            media_type: "IMAGE",
            image_url: img.url,
            is_carousel_item: true,
          },
        );
        const itemId = parseThreadsPublishId(item.data);
        if (!item.ok || !itemId) {
          return threadsFail(
            threadsErrorMessage(
              item.data,
              `Threads thread part ${i + 1} failed`,
            ),
            "Upload failed",
          );
        }
        containerIds.push(itemId);
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
        return threadsFail(err, "Chain broken");
      }
      body.reply_to_id = previousPublishedId;
    }

    // Step 1: Create container for this part (reply_to_id set above when i > 0).
    // Use /me/threads so reply_to_id is resolved in the token user's context (per Meta docs).
    const create = await postThreadsForm(
      `https://graph.threads.net/v1.0/me/threads?${threadParams}`,
      body,
    );
    const containerId = parseThreadsPublishId(create.data);
    if (!create.ok || !containerId) {
      const errMsg = threadsErrorMessage(
        create.data,
        `Threads thread part ${i + 1} failed`,
      );
      publishLog.error("[Threads] Create container failed:", {
        part: i + 1,
        status: create.status,
        body: create.data,
      });
      return threadsFail(errMsg, "Create failed");
    }

    // Step 2: Poll container status until FINISHED (Threads API requires container to be ready before publish)
    const polled = await pollThreadsContainer({
      containerId,
      accessToken,
      label: `part ${i + 1}`,
      maxAttempts: 40,
    });
    if (!polled.ok) {
      return threadsFail(polled.lastError, polled.error);
    }

    const publish = await postThreadsForm(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish?${threadParams}`,
      { creation_id: containerId },
    );
    const publishedId = parseThreadsPublishId(publish.data);
    if (!publish.ok || !publishedId) {
      const errMsg = threadsErrorMessage(publish.data, "Threads publish failed");
      publishLog.error("[Threads] Publish failed:", {
        part: i + 1,
        status: publish.status,
        body: publish.data,
      });
      return threadsFail(errMsg, "Publish failed");
    }

    // Step 3: next part's reply_to_id must be this published media id, not the container id.
    previousPublishedId = publishedId;
    if (!firstPublishedId) firstPublishedId = publishedId;
    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const rootId = firstPublishedId ?? previousPublishedId;
  const profileFallback = threadsProfileFallback(pub);
  const platformPostUrl = rootId
    ? await fetchThreadsPermalink(rootId, accessToken, profileFallback)
    : profileFallback;
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
  if (post.mediaIds && post.mediaIds.length > 0 && orderedMedia.length === 0) {
    return threadsFail(
      "Threads couldn't fetch your video or image. Re-upload the file and try again.",
      "No media",
    );
  }
  if (orderedMedia.length === 0 && !safeText) {
    return threadsFail(
      "Threads post must have text, an image, or a video.",
      "Content required",
    );
  }

  const threadParams = new URLSearchParams({ access_token: accessToken });
  const createUrl = `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`;
  let creationId: string;
  let containerReady = false;

  // Handle carousel (multiple items: images and/or videos, up to 10)
  if (orderedMedia.length > 1) {
    publishLog.info(
      `Creating Threads carousel with ${orderedMedia.length} items (images + videos)...`,
    );

    const containerIds: string[] = [];

    for (const item of orderedMedia) {
      const isVideo = item.mimeType.startsWith("video/");
      const itemRes = await postThreadsForm(createUrl, {
        media_type: isVideo ? "VIDEO" : "IMAGE",
        is_carousel_item: true,
        ...(isVideo ? { video_url: item.url } : { image_url: item.url }),
      });
      const itemId = parseThreadsPublishId(itemRes.data);

      if (itemRes.ok && itemId) {
        containerIds.push(itemId);
        publishLog.info(
          `Threads carousel item ${containerIds.length} created: ${itemId}`,
        );

        if (isVideo) {
          publishLog.info(`Polling Threads video item ${itemId} until FINISHED...`);
          const polled = await pollThreadsContainer({
            containerId: itemId,
            accessToken,
            label: `carousel video ${containerIds.length}`,
          });
          if (!polled.ok) {
            return threadsFail(polled.lastError, polled.error);
          }
          publishLog.info("Threads video item finished processing.");
        }
      } else {
        publishLog.error(
          "Failed to create Threads carousel item:",
          itemRes.data,
        );
        return threadsFail(
          threadsErrorMessage(
            itemRes.data,
            "Failed to create Threads carousel item. Please try again.",
          ),
          "Threads carousel item failed",
        );
      }

      // space out carousel item creation so item IDs stay valid
      await sleep(1000);
    }

    if (containerIds.length === 0) {
      return threadsFail("Failed to upload carousel items", "Upload failed");
    }

    // Wait before creating carousel container so items don't expire
    await sleep(8000);

    const carouselRes = await postThreadsForm(createUrl, {
      media_type: "CAROUSEL",
      children: containerIds.join(","),
      text: safeText,
    });
    const carouselId = parseThreadsPublishId(carouselRes.data);

    if (!carouselRes.ok || !carouselId) {
      const err = threadsErrorMessage(
        carouselRes.data,
        `HTTP ${carouselRes.status}`,
      );
      publishLog.error("Threads carousel creation failed:", {
        status: carouselRes.status,
        body: carouselRes.data,
      });
      return threadsFail(err);
    }

    publishLog.info("Threads carousel container created:", {
      containerId: carouselId,
      itemCount: containerIds.length,
    });

    creationId = carouselId;
  } else if (orderedMedia.length === 1 && videoUrl) {
    const createRes = await postThreadsForm(createUrl, {
      media_type: "VIDEO",
      video_url: videoUrl,
      text: safeText,
    });
    const createdId = parseThreadsPublishId(createRes.data);
    if (!createRes.ok || !createdId) {
      return threadsFail(
        threadsErrorMessage(createRes.data, `HTTP ${createRes.status}`),
      );
    }
    creationId = createdId;
    publishLog.info(`Polling Threads video ${creationId} until FINISHED...`);
    const polled = await pollThreadsContainer({
      containerId: creationId,
      accessToken,
      label: "video",
    });
    if (!polled.ok) {
      return threadsFail(polled.lastError, polled.error);
    }
    containerReady = true;
  } else if (orderedMedia.length === 1 && imageUrl) {
    const createRes = await postThreadsForm(createUrl, {
      media_type: "IMAGE",
      image_url: imageUrl,
      text: safeText,
    });
    const createdId = parseThreadsPublishId(createRes.data);
    if (!createRes.ok || !createdId) {
      return threadsFail(
        threadsErrorMessage(createRes.data, `HTTP ${createRes.status}`),
      );
    }
    creationId = createdId;
  } else {
    const createRes = await postThreadsForm(createUrl, {
      media_type: "TEXT",
      text: safeText,
    });
    const createdId = parseThreadsPublishId(createRes.data);
    if (!createRes.ok || !createdId) {
      return threadsFail(
        threadsErrorMessage(createRes.data, `HTTP ${createRes.status}`),
      );
    }
    creationId = createdId;
  }

  if (orderedMedia.length > 1) {
    const polled = await pollThreadsContainer({
      containerId: creationId,
      accessToken,
      label: "carousel",
      maxAttempts: 30,
    });
    if (!polled.ok) {
      return threadsFail(polled.lastError, polled.error);
    }
    containerReady = true;
  }

  if (!containerReady) {
    await sleep(2000);
  }

  const publishRes = await postThreadsForm(
    `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish?${threadParams}`,
    { creation_id: creationId },
  );
  if (!publishRes.ok) {
    return threadsFail(
      threadsErrorMessage(publishRes.data, `HTTP ${publishRes.status}`),
    );
  }
  const publishedSingleId = parseThreadsPublishId(publishRes.data);
  if (!publishedSingleId) {
    return threadsFail(
      "Threads publish returned no media id",
      "Publish failed",
    );
  }
  const profileFallback = threadsProfileFallback(pub);
  const platformPostUrl = await fetchThreadsPermalink(
    publishedSingleId,
    accessToken,
    profileFallback,
  );
  return {
    status: "published",
    platformPostId: publishedSingleId,
    platformPostUrl,
    publishedAt: new Date(),
  };
}
