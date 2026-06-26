/** Cloudflare Queues - publish-now processed before publish-scheduled. */
export const CF_PUBLISH_QUEUES = {
  NOW: "social0-publish-now",
  SCHEDULED: "social0-publish-scheduled",
  DLQ: "social0-publish-dlq",
} as const;

export type CfPublishPriority = "now" | "scheduled";
