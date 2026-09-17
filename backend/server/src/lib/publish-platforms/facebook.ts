/**
 * Facebook Graph API publish.
 */

import { publishLog } from "@/lib/publish-log";

import type { Post, Pub, PublishPlatformResult } from "./types";
import { fetchWithRetry } from "./helpers";
import { getMediaWithUrls } from "./media";

/**
 * POST form params to a Graph endpoint and read the `{id, post_id, error}`
 * shape every publish branch here gets back.
 *
 * The photo, video and text branches each carried this: same retry policy, same
 * parse, and the same rewrite of Graph's permission errors into something a
 * user can act on. That rewrite is the part worth having once — it is the only
 * hint that a Page needs reconnecting rather than a retry.
 */
async function postToGraph(
  url: string,
  params: URLSearchParams,
): Promise<
  | { data: FacebookGraphPostResponse }
  | { failure: { status: "failed"; lastError: string; error: string } }
> {
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
    { retries: 2, delayMs: 1000 },
  );

  const data = (await res.json().catch(() => ({}))) as FacebookGraphPostResponse;

  if (!res.ok) {
    let err = data.error?.message ?? `HTTP ${res.status}`;
    if (err.includes("must be granted") || err.includes("impersonating")) {
      err =
        "Facebook needs updated permissions. Please disconnect and reconnect your Facebook Page from the dashboard so the app can request the required access.";
    }
    return { failure: { status: "failed", lastError: err, error: err } };
  }

  return { data };
}

type FacebookGraphPostResponse = {
  id?: string;
  post_id?: string;
  error?: { message?: string };
};

export async function publishToFacebook(
  pub: Pub,
  post: Post,
  pageAccessToken: string,
): Promise<PublishPlatformResult> {
  const pageId = pub.platformUserId;
  const message = post.finalContent?.trim() ?? "";
  if (!message) {
    return {
      status: "failed",
      lastError: "Post content is empty",
      error: "Post content is empty",
    };
  }

  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];
  const images = media.filter((m) => m.mimeType.startsWith("image/"));
  const firstVideo = media.find((m) => m.mimeType.startsWith("video/"));

  let data: FacebookGraphPostResponse;
  let isVideo = false;
  let postId: string | undefined;

  // Handle multi-photo posts (2+ images)
  if (images.length > 1) {
    publishLog.info(`📸 Creating Facebook multi-photo post with ${images.length} images...`,);

    // Upload all photos as unpublished first
    const photoIds: Array<{ media_fbid: string }> = [];

    for (const img of images.slice(0, 10)) {
      const photoRes = await fetchWithRetry(
        `https://graph.facebook.com/v21.0/${pageId}/photos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pageAccessToken}`,
          },
          body: JSON.stringify({
            url: img.url,
            published: false,
          }),
        },
        { retries: 2, delayMs: 1000 },
      );

      const photoData = (await photoRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };

      if (photoRes.ok && photoData.id) {
        photoIds.push({ media_fbid: photoData.id });
        publishLog.info(`✅ Photo ${photoIds.length} uploaded: ${photoData.id}`);
      } else {
        publishLog.error(`❌ Failed to upload photo:`, photoData.error);
      }
    }

    if (photoIds.length === 0) {
      return {
        status: "failed",
        lastError: "Failed to upload photos for multi-photo post",
        error: "Upload failed",
      };
    }

    // Create multi-photo post
    const postRes = await fetchWithRetry(
      `https://graph.facebook.com/v21.0/${pageId}/feed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pageAccessToken}`,
        },
        body: JSON.stringify({
          message: message,
          attached_media: photoIds,
        }),
      },
      { retries: 2, delayMs: 1000 },
    );

    data = (await postRes.json().catch(() => ({}))) as {
      id?: string;
      post_id?: string;
      error?: { message?: string };
    };

    if (!postRes.ok) {
      let err = data.error?.message ?? `HTTP ${postRes.status}`;
      if (err.includes("must be granted") || err.includes("impersonating")) {
        err =
          "Facebook needs updated permissions. Please disconnect and reconnect your Facebook Page from the dashboard so the app can request the required access.";
      }
      publishLog.error("Facebook multi-photo post failed:", {
        status: postRes.status,
        error: data.error,
      });
      return { status: "failed", lastError: err, error: err };
    }

    postId = data.post_id ?? data.id?.split("_")[1] ?? data.id;
  } else if (images.length === 1) {
    // Single image
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      url: images[0].url,
      caption: message,
    });

    const posted = await postToGraph(`https://graph.facebook.com/v21.0/${pageId}/photos`, params);
    if ("failure" in posted) return posted.failure;
    data = posted.data;

    postId = data.post_id ?? data.id?.split("_")[1] ?? data.id;
  } else if (firstVideo?.url) {
    // Single video
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      file_url: firstVideo.url,
      description: message,
    });

    const posted = await postToGraph(`https://graph-video.facebook.com/v21.0/${pageId}/videos`, params);
    if ("failure" in posted) return posted.failure;
    data = posted.data;

    isVideo = true;
    postId = data.post_id ?? data.id?.split("_")[1] ?? data.id;
  } else {
    // Text-only post
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      message: message,
    });

    const posted = await postToGraph(`https://graph.facebook.com/v21.0/${pageId}/feed`, params);
    if ("failure" in posted) return posted.failure;
    data = posted.data;

    postId = data.post_id ?? data.id?.split("_")[1] ?? data.id;
  }

  const rawPostId =
    data.post_id ??
    (typeof data.id === "string" && data.id.includes("_") ? data.id : null) ??
    postId ??
    data.id ??
    null;
  const platformPostId = rawPostId
    ? rawPostId.includes("_")
      ? rawPostId
      : `${pageId}_${rawPostId}`
    : null;

  // Prefer Graph API `permalink_url` from create responses. Hand-built paths often 404 — fetch the real permalink.
  const handmadeFallback = postId
    ? isVideo
      ? `https://www.facebook.com/${pageId}/videos/${postId}/`
      : `https://www.facebook.com/${pageId}/posts/${postId}`
    : null;
  const platformPostUrl = platformPostId
    ? await fetchFacebookPermalink(
        platformPostId,
        pageAccessToken,
        handmadeFallback,
      )
    : handmadeFallback;

  return {
    status: "published",
    platformPostId,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

/** Cosmetic only — never fail a live Facebook publish over permalink lookup. */
async function fetchFacebookPermalink(
  postId: string,
  pageAccessToken: string,
  fallback: string | null,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      fields: "permalink_url",
      access_token: pageAccessToken,
    });
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(postId)}?${params}`,
    );
    if (!res.ok) return fallback;
    const data = (await res.json().catch(() => ({}))) as {
      permalink_url?: string;
    };
    const permalink = data.permalink_url?.trim();
    if (permalink) {
      if (/^https:\/\//i.test(permalink)) return permalink;
      if (permalink.startsWith("/")) {
        return `https://www.facebook.com${permalink}`;
      }
    }
  } catch (err) {
    publishLog.warn("Facebook permalink fetch failed (using fallback):", err);
  }
  return fallback;
}

