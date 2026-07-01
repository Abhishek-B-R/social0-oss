import type { PostHog } from "posthog-js";

export type PostContentType =
  | "text"
  | "image"
  | "video"
  | "threads"
  | "collection";

export type PostLifecycleEvent =
  | "post_published"
  | "post_scheduled"
  | "post_drafted";

export function capturePostLifecycle(
  posthog: PostHog | null | undefined,
  event: PostLifecycleEvent,
  contentType: PostContentType,
  platformCount: number,
) {
  posthog?.capture(event, {
    content_type: contentType,
    platform_count: platformCount,
  });
}

export function captureBulkPostsScheduled(
  posthog: PostHog | null | undefined,
  contentType: "image" | "video",
  postCount: number,
  platformCount: number,
) {
  posthog?.capture("bulk_posts_scheduled", {
    content_type: contentType,
    post_count: postCount,
    platform_count: platformCount,
  });
}

export function capturePostAction(
  posthog: PostHog | null | undefined,
  event: string,
  properties: Record<string, string | number | boolean | undefined>,
) {
  posthog?.capture(event, properties);
}
