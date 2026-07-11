import type { JobProgressEvent, JobProgressSnapshot } from "@social0/shared";

/** Phases worth surfacing on the public v1 API (skip queued/fan_out noise). */
const V1_STREAM_PHASES = new Set([
  "platform_uploading",
  "platform_success",
  "platform_failed",
  "completed",
  "failed",
]);

/** Map event phase → job status at that moment (not the final snapshot). */
function statusForPhase(phase: string): JobProgressSnapshot["status"] {
  if (phase === "completed") return "completed";
  if (phase === "failed") return "failed";
  return "processing";
}

export function formatV1JobResponse(snapshot: JobProgressSnapshot) {
  const latestByPlatform = new Map<
    string,
    { platform: string; connected_account_id: string | null; phase: string; message: string | null }
  >();

  for (const event of snapshot.events) {
    if (!event.platform) continue;
    latestByPlatform.set(event.platform, {
      platform: event.platform,
      connected_account_id: event.connectedAccountId ?? null,
      phase: event.phase,
      message: event.message ?? null,
    });
  }

  return {
    tracking_id: snapshot.trackingId,
    post_id: snapshot.postId,
    status: snapshot.status,
    total: snapshot.total,
    completed: snapshot.completed,
    failed: snapshot.failed,
    platform_statuses: [...latestByPlatform.values()],
    created_at: snapshot.events[0]?.ts ?? snapshot.updatedAt,
    completed_at:
      snapshot.status === "completed" || snapshot.status === "failed"
        ? snapshot.updatedAt
        : null,
  };
}

/** Slim SSE payload — no userId, no repeated tracking/post ids on every chunk. */
export function formatV1StreamEvent(
  event: JobProgressEvent,
  _snapshot: JobProgressSnapshot,
): Record<string, unknown> | null {
  if (!V1_STREAM_PHASES.has(event.phase)) return null;

  const progress = event.progress;
  const payload: Record<string, unknown> = {
    status: statusForPhase(event.phase),
    phase: event.phase,
    completed: progress?.completed ?? 0,
    failed: progress?.failed ?? 0,
    total: progress?.total ?? 0,
  };
  if (event.platform) payload.platform = event.platform;
  if (event.message) payload.message = event.message;
  return payload;
}
