/** BullMQ queue names - one queue per concern for independent scaling. */
export const QUEUES = {
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
  EMAIL_POST_FAILED: "email.post-failed",
  TOKEN_REFRESH: "token.refresh",
  TOKEN_HEALTH_SWEEP: "token.health-sweep",
  CRON_PUBLISH_SCHEDULED: "cron.publish-scheduled",
  CRON_REPOST: "cron.repost",
  CRON_AUTOPLUG: "cron.autoplug",
  CRON_BILLING_ZOMBIE_CLEANUP: "cron.billing-zombie-cleanup",
  BILLING_SYNC: "billing.sync",
  MEDIA_CONFIRM: "media.confirm",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
