/**
 * Platform publish dispatcher.
 * Platform-specific logic lives beside this file (facebook.ts, etc.).
 */

import {
  validateContentLength,
  validateMediaCount,
} from "@/lib/publish-validation";
import { publishLog } from "@/lib/publish-log";
import type {
  PlatformPublishOptions,
  Post,
  Pub,
  PublishPlatformResult,
} from "./types";
import { publishToFacebook } from "./facebook";
import { publishToBluesky } from "./bluesky";
import { publishToYouTube } from "./youtube";
import { publishToPinterest } from "./pinterest";
import { publishToInstagram } from "./instagram";
import { publishToTikTok } from "./tiktok";
import { publishToThreads } from "./threads";

export type {
  PublishPlatformResult,
  PlatformPublishOptions,
  ThreadPart,
  TikTokPlatformOptions,
  Pub,
  Post,
} from "./types";
export { getThreadParts } from "./thread-parts";

export async function publishToPlatform(
  pub: Pub,
  post: Post,
  accessToken: string,
  accessSecret: string | null,
  platformOptions?: PlatformPublishOptions,
): Promise<PublishPlatformResult> {
  const mediaCountErr = validateMediaCount(post.mediaIds ?? null);
  if (mediaCountErr) {
    return { status: "failed", lastError: mediaCountErr, error: mediaCountErr };
  }
  const contentErr = validateContentLength(
    pub.platform,
    post.finalContent ?? "",
  );
  if (contentErr) {
    return { status: "failed", lastError: contentErr, error: contentErr };
  }
  let result: PublishPlatformResult;

  switch (pub.platform) {
    case "facebook":
      result = await publishToFacebook(pub, post, accessToken);
      break;
    case "bluesky":
      result = await publishToBluesky(pub, post, accessToken, accessSecret);
      break;
    case "youtube":
      result = await publishToYouTube(pub, post, accessToken);
      break;
    case "pinterest":
      result = await publishToPinterest(pub, post, accessToken);
      break;
    case "instagram":
      result = await publishToInstagram(
        pub,
        post,
        accessToken,
        platformOptions?.instagram,
      );
      break;
    case "tiktok":
      result = await publishToTikTok(
        pub,
        post,
        accessToken,
        platformOptions?.tiktok,
      );
      break;
    case "threads":
      result = await publishToThreads(pub, post, accessToken);
      break;
    default:
      result = {
        status: "failed",
        lastError: "Unknown platform",
        error: "Unknown platform",
      };
      break;
  }

  publishLog.info(`[publishToPlatform] ${pub.platform} final result`, result);

  return result;
}
