import { emitUserWebhookEvent } from "./user-webhook-delivery.js";

/**
 * `post.scheduled` / `post.deleted` for every entry point (dashboard RPC,
 * queue, REST `/api/publish`, `/v1`), so a subscriber sees the same events
 * whichever surface made the change. Payload shape matches the `/v1` emits.
 *
 * Fire-and-forget: only call from API-droplet handlers, never from Workers
 * code (see `emitUserWebhookEvent`).
 */
export function emitPostScheduledWebhook(
  userId: string,
  postId: string,
  scheduledAt: Date,
): void {
  emitUserWebhookEvent(userId, "post.scheduled", {
    post_id: postId,
    scheduled_at: scheduledAt.toISOString(),
  });
}

export function emitPostDeletedWebhook(userId: string, postId: string): void {
  emitUserWebhookEvent(userId, "post.deleted", { post_id: postId });
}
