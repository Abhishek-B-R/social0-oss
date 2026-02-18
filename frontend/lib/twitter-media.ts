/**
 * X (Twitter) media upload helpers
 * Uses Twitter API v1 for media upload with OAuth 1.0a User Context.
 * Both access token and access secret are required (OAuth 1.0a).
 */

import { TwitterApi } from "twitter-api-v2";

function getTwitterClient(accessToken: string, accessSecret: string): TwitterApi {
  const appKey = process.env.TWITTER_CONSUMER_KEY;
  const appSecret = process.env.TWITTER_CONSUMER_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("Twitter consumer key/secret not configured");
  }
  return new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });
}

/**
 * Upload an image to X/Twitter and return the media_id
 * Uses OAuth 1.0a User Context (access token + access secret).
 */
export async function uploadTwitterImage(
  imageUrl: string,
  accessToken: string,
  accessSecret: string,
): Promise<string> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch image from storage: ${imageRes.statusText}`);
  }

  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  const contentType = imageRes.headers.get("content-type") || "image/jpeg";
  const client = getTwitterClient(accessToken, accessSecret);

  try {
    const mediaId = await client.v1.uploadMedia(imageBuffer, {
      mimeType: contentType,
    });
    return mediaId;
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to upload image";
    if (e && typeof e === "object" && "data" in e) {
      const errorData = e.data as Record<string, unknown>;
      const detailedError = errorData.error || errorData.message || errorData.errors || err;
      throw new Error(`Twitter image upload: ${detailedError}`);
    }
    throw new Error(`Twitter image upload: ${err}`);
  }
}

/**
 * Upload a video to X/Twitter and return the media_id
 * Uses OAuth 1.0a User Context. Videos may require chunked upload for files > 5MB.
 */
export async function uploadTwitterVideo(
  videoUrl: string,
  accessToken: string,
  accessSecret: string,
): Promise<string> {
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to fetch video from storage: ${videoRes.statusText}`);
  }

  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const contentType = videoRes.headers.get("content-type") || "video/mp4";
  const client = getTwitterClient(accessToken, accessSecret);

  try {
    const mediaId = await client.v1.uploadMedia(videoBuffer, {
      mimeType: contentType,
    });

    let status = await client.v1.mediaInfo(mediaId);
    let attempts = 0;
    const maxAttempts = 30;
    type ProcessingInfo = { state?: string; error?: { message?: string } };
    const getInfo = (s: typeof status): ProcessingInfo | undefined =>
      "processing_info" in s ? (s as { processing_info?: ProcessingInfo }).processing_info : undefined;

    for (let info = getInfo(status); info?.state === "pending" || info?.state === "in_progress"; info = getInfo(status)) {
      if (attempts >= maxAttempts) {
        throw new Error("Video processing timeout - video is still being processed");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      status = await client.v1.mediaInfo(mediaId);
      const next = getInfo(status);
      if (next?.state === "failed") {
        throw new Error(`Video processing failed: ${next.error?.message ?? "Unknown error"}`);
      }
      attempts++;
    }

    const final = getInfo(status);
    if (final?.state === "failed") {
      throw new Error(`Video processing failed: ${final.error?.message ?? "Unknown error"}`);
    }

    return mediaId;
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to upload video";
    if (e && typeof e === "object" && "data" in e) {
      const errorData = e.data as Record<string, unknown>;
      const detailedError = errorData.error || errorData.message || errorData.errors || err;
      throw new Error(`Twitter video upload: ${detailedError}`);
    }
    throw new Error(`Twitter video upload: ${err}`);
  }
}
