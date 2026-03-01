/**
 * X (Twitter) media upload helpers
 * Uses Twitter API v1 for media upload with OAuth 1.0a User Context.
 * Both access token and access secret are required (OAuth 1.0a).
 */

import { TwitterApi } from "twitter-api-v2";

/** Extract a readable message from Twitter SDK/API errors (v1/v2 and axios-style). */
function getTwitterMediaErrorMessage(e: unknown, context: string): string {
  const fallback = e instanceof Error ? e.message : "Unknown error";
  if (e && typeof e === "object") {
    const err = e as Record<string, unknown>;
    // SDK sometimes attaches API response on .data
    if (typeof err.data === "object" && err.data !== null) {
      const data = err.data as Record<string, unknown>;
      const msg =
        data.error ??
        data.message ??
        (Array.isArray(data.errors)
          ? (data.errors as Array<{ message?: string }>).map((x) => x.message ?? "").filter(Boolean).join(", ") || null
          : null) ??
        data.detail ??
        data.title;
      if (msg && typeof msg === "string") return `${context}: ${msg}`;
    }
    // Axios-style: response.data
    const res = err.response as { data?: unknown; status?: number } | undefined;
    if (res && typeof res === "object" && res.data != null) {
      const data = res.data as Record<string, unknown>;
      const msg =
        data.error ??
        data.message ??
        data.detail ??
        (Array.isArray(data.errors)
          ? (data.errors as Array<{ message?: string }>).map((x) => x.message ?? "").filter(Boolean).join(", ") || null
          : null);
      if (msg && typeof msg === "string")
        return res.status ? `${context}: ${msg} (HTTP ${res.status})` : `${context}: ${msg}`;
      if (res.status) return `${context}: Request failed (HTTP ${res.status})`;
    }
    if (err.cause instanceof Error && err.cause.message)
      return `${context}: ${err.cause.message}`;
    if (typeof err.code === "string" && err.code) return `${context}: ${err.code}`;
    if (typeof err.status === "number") return `${context}: Request failed (HTTP ${err.status})`;
  }
  if (fallback === "Request failed.") {
    try {
      const safeKeys = ["code", "status", "cause", "data", "response"];
      const hint: Record<string, unknown> = {};
      if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        for (const k of safeKeys) {
          if (k in o && o[k] !== undefined) {
            if (typeof o[k] === "object" && o[k] !== null && "data" in (o[k] as object))
              hint[k] = "(has data)";
            else if (typeof o[k] === "object" && o[k] !== null && "status" in (o[k] as object))
              hint[k] = { ...(o[k] as object), data: "(omitted)" };
            else hint[k] = o[k];
          }
        }
      }
      console.error("[Twitter media] Generic Request failed — error hint:", JSON.stringify(hint));
    } catch {
      console.error("[Twitter media] Generic Request failed — raw error:", e);
    }
  }
  return `${context}: ${fallback}`;
}

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
    throw new Error(getTwitterMediaErrorMessage(e, "Twitter image upload"));
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
    videoRes = await fetch(videoUrl);
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    throw new Error(
      `Twitter video upload: Could not fetch video from storage. The server may not be able to reach the media URL (${msg}).`,
    );
  }
  if (!videoRes.ok) {
    throw new Error(
      `Twitter video upload: Failed to fetch video from storage: ${videoRes.status} ${videoRes.statusText}. Ensure the media URL is reachable from the server.`,
    );
  }

  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const contentType = videoRes.headers.get("content-type") || "video/mp4";
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
        getTwitterMediaErrorMessage(lastUploadError, "Twitter video upload"),
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
    throw new Error(getTwitterMediaErrorMessage(e, "Twitter video upload"));
  }
}
