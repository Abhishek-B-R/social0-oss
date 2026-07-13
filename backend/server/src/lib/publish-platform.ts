/**
 * @deprecated Prefer importing from "@/lib/publish-platforms".
 * Re-exports kept for existing callers.
 */
export {
  publishToPlatform,
  getThreadParts,
} from "./publish-platforms";
export type {
  PublishPlatformResult,
  PlatformPublishOptions,
  ThreadPart,
  TikTokPlatformOptions,
  Pub,
  Post,
} from "./publish-platforms";
