/**
 * X (Twitter) media upload helpers.
 * Always uses fetch + OAuth 1.0a (Worker-safe). Never twitter-api-v2 —
 * that SDK calls Node https.request, which fails under CF Workers / unenv.
 */

import { formatTwitterMediaError } from "@/lib/twitter-errors";
import { fetchAllowedMedia } from "@/lib/media-fetch";
import {
  uploadTwitterImageFetch,
  uploadTwitterVideoFetch,
} from "@/lib/twitter-media-upload-fetch";

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

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await uploadTwitterVideoFetch(
        videoBuffer,
        contentType,
        accessToken,
        accessSecret,
      );
    } catch (e) {
      lastError = e;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  throw new Error(formatTwitterMediaError(lastError, "Twitter video upload"), {
    cause: lastError,
  });
}
