import type { JobProgressEvent, JobProgressSnapshot } from "@social0/shared";
import type { EnrichedJobSnapshot } from "./resolve-job-snapshot.js";

export type V1JobStatus =
  | JobProgressSnapshot["status"]
  | "partial";

/** Mixed success/failure → partial (DB job row stays completed). */
export function resolveV1JobStatus(snapshot: {
  status: JobProgressSnapshot["status"];
  total: number;
  completed: number;
  failed: number;
}): V1JobStatus {
  if (
    snapshot.total > 0 &&
    snapshot.completed > 0 &&
    snapshot.failed > 0 &&
    snapshot.completed + snapshot.failed >= snapshot.total
  ) {
    return "partial";
  }
  return snapshot.status;
}

function isTerminalV1Status(status: V1JobStatus): boolean {
  return status === "completed" || status === "failed" || status === "partial";
}

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

type PlatformStatus = {
  platform: string;
  connected_account_id: string | null;
  phase: string;
  message: string | null;
  error: string | null;
};

function buildPlatformStatuses(events: JobProgressEvent[]): PlatformStatus[] {
  const latestByPlatform = new Map<string, PlatformStatus>();

  for (const event of events) {
    if (!event.platform) continue;
    const failed = event.phase === "platform_failed";
    latestByPlatform.set(event.platform, {
      platform: event.platform,
      connected_account_id: event.connectedAccountId ?? null,
      phase: event.phase,
      message: event.message ?? null,
      error: failed ? (event.message ?? null) : null,
    });
  }

  return [...latestByPlatform.values()];
}

function buildErrors(platformStatuses: PlatformStatus[]) {
  return platformStatuses
    .filter((p) => p.phase === "platform_failed")
    .map((p) => ({
      platform: p.platform,
      connected_account_id: p.connected_account_id,
      message: p.error ?? p.message ?? "Unknown error",
    }));
}

export function formatV1JobResponse(snapshot: EnrichedJobSnapshot) {
  const platform_statuses = buildPlatformStatuses(snapshot.events);
  const errors = buildErrors(platform_statuses);
  const status = resolveV1JobStatus(snapshot);

  return {
    tracking_id: snapshot.trackingId,
    post_id: snapshot.postId,
    status,
    total: snapshot.total,
    completed: snapshot.completed,
    failed: snapshot.failed,
    platform_statuses,
    errors,
    failure_reason: snapshot.failureReason ?? null,
    created_at: snapshot.events[0]?.ts ?? snapshot.updatedAt,
    completed_at: isTerminalV1Status(status) ? snapshot.updatedAt : null,
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
  if (event.phase === "platform_failed") payload.error = event.message ?? null;
  return payload;
}
