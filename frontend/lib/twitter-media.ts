/**
 * X (Twitter) media upload helpers
 * Uses Twitter API v1 for media upload with OAuth 1.0a User Context
 * Note: Twitter v1 media upload endpoints require OAuth 1.0a User Context authentication
 * We use the twitter-api-v2 library which handles OAuth 1.0a signing internally
 */

import { TwitterApi } from "twitter-api-v2";

/**
 * Upload an image to X/Twitter and return the media_id
 * Uses OAuth 1.0a User Context authentication (required for v1 media endpoints)
 */
export async function uploadTwitterImage(
  imageUrl: string,
  accessToken: string,
): Promise<string> {
  // Download image from R2
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch image from storage: ${imageRes.statusText}`);
  }

  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  
  // Detect content type
  const contentType = imageRes.headers.get("content-type") || "image/jpeg";
  
  // Get Twitter app credentials from env
  const appKey = process.env.TWITTER_CONSUMER_KEY;
  const appSecret = process.env.TWITTER_CONSUMER_SECRET;
  
  if (!appKey || !appSecret) {
    throw new Error("Twitter consumer key/secret not configured");
  }

  try {
    // Twitter v1 media upload endpoints - try OAuth 2.0 Bearer token first
    // Note: Twitter's v1 media endpoints may require OAuth 1.0a User Context
    // but we'll try Bearer token as some sources suggest it might work
    const client = new TwitterApi(accessToken);
    
    const mediaId = await client.v1.uploadMedia(imageBuffer, {
      mimeType: contentType,
    });

    return mediaId;
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to upload image";
    // Enhanced error handling for 403/authentication errors
    const errorStr = String(e).toLowerCase();
    const errorMessage = err.toLowerCase();
    
    if (
      errorStr.includes("403") ||
      errorMessage.includes("403") ||
      errorStr.includes("forbidden") ||
      errorMessage.includes("forbidden") ||
      errorStr.includes("unauthorized") ||
      errorMessage.includes("unauthorized")
    ) {
      // Twitter v1 media upload endpoints require OAuth 1.0a User Context
      // OAuth 2.0 Bearer tokens don't work for v1 media endpoints
      throw new Error(
        "Twitter v1 media upload requires OAuth 1.0a User Context authentication. " +
        "Your account is connected with OAuth 2.0, which doesn't support media uploads. " +
        "Please check if your Twitter app has the necessary permissions or contact support."
      );
    }
    
    // Include original error details
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
 * Note: Videos require chunked upload for files > 5MB
 * Uses OAuth 1.0a User Context authentication (required for v1 media endpoints)
 */
export async function uploadTwitterVideo(
  videoUrl: string,
  accessToken: string,
): Promise<string> {
  // Download video from R2
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to fetch video from storage: ${videoRes.statusText}`);
  }

  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const contentType = videoRes.headers.get("content-type") || "video/mp4";
  
  // Get Twitter app credentials from env
  const appKey = process.env.TWITTER_CONSUMER_KEY;
  const appSecret = process.env.TWITTER_CONSUMER_SECRET;
  
  if (!appKey || !appSecret) {
    throw new Error("Twitter consumer key/secret not configured");
  }

  try {
    // Twitter v1 media upload endpoints - try OAuth 2.0 Bearer token first
    // Note: Twitter's v1 media endpoints may require OAuth 1.0a User Context
    const client = new TwitterApi(accessToken);
    
    const mediaId = await client.v1.uploadMedia(videoBuffer, {
      mimeType: contentType,
      additionalOwners: undefined,
      mediaCategory: "tweet_video", // Required for videos
    });

    // Wait for video processing to complete (Twitter requires this before posting)
    let processingInfo = await client.v1.mediaInfo(mediaId);
    let attempts = 0;
    const maxAttempts = 30; // Wait up to 30 seconds
    
    while (
      processingInfo.processingInfo?.state === "pending" ||
      processingInfo.processingInfo?.state === "in_progress"
    ) {
      if (attempts >= maxAttempts) {
        throw new Error("Video processing timeout - video is still being processed");
      }
      
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
      processingInfo = await client.v1.mediaInfo(mediaId);
      attempts++;
    }

    if (processingInfo.processingInfo?.state === "failed") {
      throw new Error(
        `Video processing failed: ${processingInfo.processingInfo.error?.message || "Unknown error"}`,
      );
    }

    return mediaId;
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to upload video";
    // Enhanced error handling for 403/authentication errors
    const errorStr = String(e).toLowerCase();
    const errorMessage = err.toLowerCase();
    
    if (
      errorStr.includes("403") ||
      errorMessage.includes("403") ||
      errorStr.includes("forbidden") ||
      errorMessage.includes("forbidden") ||
      errorStr.includes("unauthorized") ||
      errorMessage.includes("unauthorized")
    ) {
      // Twitter v1 media upload endpoints require OAuth 1.0a User Context
      throw new Error(
        "Twitter v1 media upload requires OAuth 1.0a User Context authentication. " +
        "Your account is connected with OAuth 2.0, which doesn't support media uploads. " +
        "Please check if your Twitter app has the necessary permissions or contact support."
      );
    }
    
    // Include original error details
    if (e && typeof e === "object" && "data" in e) {
      const errorData = e.data as Record<string, unknown>;
      const detailedError = errorData.error || errorData.message || errorData.errors || err;
      throw new Error(`Twitter video upload: ${detailedError}`);
    }
    
    throw new Error(`Twitter video upload: ${err}`);
  }
}
