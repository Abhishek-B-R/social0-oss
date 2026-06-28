/**
 * Analytics logging for plan-limit events.
 * Not for security - for understanding how often users hit limits.
 * Logs are structured for easy grep / forwarding to analytics.
 */

const PREFIX = "[plan-limit]";

function logEvent(
  event: string,
  payload: Record<string, string | number | boolean | null | undefined>,
) {
  const line = `${PREFIX} ${event} ${JSON.stringify(payload)}`;
  console.log(line);
}

/** Publish was blocked (free tier, X rate limit, etc.). */
export function logPublishBlocked(
  reason: "subscription" | "twitter_rate_limit" | "free_post_limit",
  userId: string,
  postId?: string,
  extra?: { used?: number; limit?: number },
) {
  logEvent("publish_blocked", {
    reason,
    userId,
    postId: postId ?? null,
    ...extra,
  });
}

/** New connection was blocked due to account limit. */
export function logConnectBlocked(
  userId: string,
  platform: string,
  reason: string,
  currentTotal: number,
  limitTotal: number,
) {
  logEvent("connect_blocked", {
    userId,
    platform,
    reason,
    currentTotal,
    limitTotal,
  });
}

/** Cron skipped running a job because user's plan doesn't allow it. */
export function logCronSkipped(
  type: "resurface" | "autoplug",
  userId: string,
  resourceId: string,
) {
  logEvent("cron_skipped", {
    type,
    userId,
    resourceId,
  });
}
