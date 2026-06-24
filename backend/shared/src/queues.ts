/** BullMQ queue names — one queue per concern for independent scaling. */
export const QUEUES = {
  /** Fan-out orchestrator: splits a post into per-platform jobs. */
  PUBLISH: "publish",
  /** Long-running per-platform publish (TikTok, YouTube, Meta, etc.). */
  PLATFORM_PUBLISH: "platform-publish",
  /** Transactional email (post failed, etc.). */
  EMAIL: "email",
  /** OAuth token refresh / token-health cron work. */
  TOKEN: "token",
  /** Scheduled post dispatcher (alternative to BullMQ delayed jobs on publish). */
  SCHEDULER: "scheduler",
  /** Media confirm / processing after R2 upload. */
  MEDIA: "media",
  /** Billing sync / webhook follow-up (optional). */
  BILLING: "billing",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOB_NAMES = {
  PUBLISH_POST: "publish.post",
  PUBLISH_PLATFORM: "publish.platform",
  EMAIL_POST_FAILED: "email.post-failed",
  TOKEN_REFRESH: "token.refresh",
  TOKEN_HEALTH_SWEEP: "token.health-sweep",
  CRON_PUBLISH_SCHEDULED: "cron.publish-scheduled",
  CRON_REPOST: "cron.repost",
  CRON_AUTOPLUG: "cron.autoplug",
  BILLING_SYNC: "billing.sync",
  MEDIA_CONFIRM: "media.confirm",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
