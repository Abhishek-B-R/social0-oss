/**
 * X (Twitter) media upload helpers
 * Uses Twitter API v1 for media upload with OAuth 1.0a User Context.
 * Both access token and access secret are required (OAuth 1.0a).
 */

import { TwitterApi } from "twitter-api-v2";
import { formatTwitterMediaError } from "@/lib/twitter-errors";
import { fetchAllowedMedia } from "@/lib/media-fetch";
import {
  isPublishWorkerRuntime,
  uploadTwitterImageFetch,
  uploadTwitterVideoFetch,
} from "@/lib/twitter-media-upload-fetch";

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
  const imageRes = await fetchAllowedMedia(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch image from storage: ${imageRes.statusText}`);
  }

  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  const contentType = imageRes.headers.get("content-type") || "image/jpeg";

  if (isPublishWorkerRuntime()) {
    try {
      return await uploadTwitterImageFetch(
        imageBuffer,
        contentType,
        accessToken,
        accessSecret,
      );
    } catch (e) {
      throw new Error(formatTwitterMediaError(e, "Twitter image upload"), {
        cause: e,
      });
    }
  }

  const client = getTwitterClient(accessToken, accessSecret);

  try {
    const mediaId = await client.v1.uploadMedia(imageBuffer, {
      mimeType: contentType,
    });
    return mediaId;
  } catch (e) {
    throw new Error(formatTwitterMediaError(e, "Twitter image upload"), {
      cause: e,
    });
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
  let videoRes: Response;
  try {
    videoRes = await fetchAllowedMedia(videoUrl);
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    throw new Error(
      `Twitter video upload: Could not fetch video from storage. The server may not be able to reach the media URL (${msg}).`,
      { cause: fetchErr },
    );
  }
  if (!videoRes.ok) {
    throw new Error(
      `Twitter video upload: Failed to fetch video from storage: ${videoRes.status} ${videoRes.statusText}. Ensure the media URL is reachable from the server.`,
    );
  }

  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const contentType = videoRes.headers.get("content-type") || "video/mp4";

  if (isPublishWorkerRuntime()) {
    try {
      return await uploadTwitterVideoFetch(
        videoBuffer,
        contentType,
        accessToken,
        accessSecret,
      );
    } catch (e) {
      throw new Error(formatTwitterMediaError(e, "Twitter video upload"), {
        cause: e,
      });
    }
  }

  const client = getTwitterClient(accessToken, accessSecret);

  try {
    let mediaId: string | undefined;
    let lastUploadError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        mediaId = await client.v1.uploadMedia(videoBuffer, {
          mimeType: contentType,
        });
        break;
      } catch (e) {
        lastUploadError = e;
        if (attempt < 2)
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (!mediaId)
      throw new Error(
        formatTwitterMediaError(lastUploadError, "Twitter video upload"),
        { cause: lastUploadError },
      );

    let status = await client.v1.mediaInfo(mediaId);
    let attempts = 0;
    const maxAttempts = 60;
    type ProcessingInfo = { state?: string; error?: { message?: string } };
    const getInfo = (s: typeof status): ProcessingInfo | undefined =>
      "processing_info" in s ? (s as { processing_info?: ProcessingInfo }).processing_info : undefined;

    for (let info = getInfo(status); info?.state === "pending" || info?.state === "in_progress"; info = getInfo(status)) {
      if (attempts >= maxAttempts) {
        throw new Error("Video processing timeout - video is still being processed");
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
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
    throw new Error(formatTwitterMediaError(e, "Twitter video upload"), {
      cause: e,
    });
  }
}
