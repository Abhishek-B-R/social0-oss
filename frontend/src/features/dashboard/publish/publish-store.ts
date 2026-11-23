import { useSyncExternalStore } from "react";
import type { PublicationErrorKind } from "@/api/dashboard";

/** One account's progress in the tray. */
export type TrayRowStatus = "waiting" | "processing" | "published" | "failed";

export type TrayRow = {
  accountId: string;
  platform: string;
  handle: string;
  status: TrayRowStatus;
  url?: string | null;
  error?: string | null;
  /**
   * Server's classification of `error` (reconnect / content / plan /
   * transient). Null until the publication list has been read for a failure.
   */
  errorKind?: PublicationErrorKind | null;
  publicationId?: string | null;
  /** True while a Retry for this row is running. */
  retrying?: boolean;
};

export type TrayJobPhase =
  | "uploading"
  | "saving"
  | "publishing"
  | "done"
  | "failed";

export type TrayJob = {
  id: string;
  /** First line of the post, for the tray header. */
  title: string;
  kind: "now" | "scheduled" | "queue" | "draft";
  phase: TrayJobPhase;
  /** 0–100 while uploading. */
  uploadPercent: number | null;
  postId: string | null;
  /** When scheduled / queued: ISO time + a display label. */
  scheduledLabel?: string;
  /**
   * Queue slot time (ISO) this job is filling. Held while it uploads / saves,
   * so another "Add to queue" doesn't pick the same slot (see heldQueueTimes).
   */
  queueAt?: string;
  rows: TrayRow[];
  /** Whole-job failure (upload / save). */
  error?: string;
  createdAt: number;
  /** Workspace base path the job was started in ("/dashboard" or a team). */
  basePath: string;
  /** Abort the upload (only while uploading). */
  cancel?: () => void;
  /** Reopen the composer with the content that failed to save. */
  reopen?: () => void;
  /** Notes shown under the rows (e.g. auto-plug couldn't be set up). */
  notes?: string[];
};

type State = { jobs: TrayJob[] };

let state: State = { jobs: [] };
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  for (const l of listeners) l();
}

const MAX_TRAY_JOBS = 6;

/** Jobs still doing work: never pushed out of the tray to make room. */
function isActive(job: TrayJob): boolean {
  return job.phase === "uploading" || job.phase === "saving" || job.phase === "publishing";
}

export function addTrayJob(job: TrayJob): void {
  const jobs = [job, ...state.jobs.filter((j) => j.id !== job.id)];
  // Drop the oldest finished jobs first; running ones stay visible.
  for (let i = jobs.length - 1; i > 0 && jobs.length > MAX_TRAY_JOBS; i--) {
    if (!isActive(jobs[i])) jobs.splice(i, 1);
  }
  emit({ jobs });
}

export function updateTrayJob(id: string, patch: Partial<TrayJob> | ((j: TrayJob) => Partial<TrayJob>)): void {
  let changed = false;
  const jobs = state.jobs.map((j) => {
    if (j.id !== id) return j;
    changed = true;
    const p = typeof patch === "function" ? patch(j) : patch;
    return { ...j, ...p };
  });
  if (changed) emit({ jobs });
}

export function updateTrayRow(
  jobId: string,
  accountId: string,
  patch: Partial<TrayRow>,
): void {
  updateTrayJob(jobId, (j) => ({
    rows: j.rows.map((r) => (r.accountId === accountId ? { ...r, ...patch } : r)),
  }));
}

export function removeTrayJob(id: string): void {
  if (!state.jobs.some((j) => j.id === id)) return;
  emit({ jobs: state.jobs.filter((j) => j.id !== id) });
}

export function getTrayJob(id: string): TrayJob | undefined {
  return state.jobs.find((j) => j.id === id);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTrayJobs(): TrayJob[] {
  return useSyncExternalStore(
    subscribe,
    () => state.jobs,
    () => state.jobs,
  );
}

/**
 * Queue slot times claimed by jobs that aren't saved yet: the server can't
 * see them, so the next-slot lookup excludes them. Sorted, for a stable key.
 */
export function heldQueueTimes(jobs: readonly TrayJob[]): string[] {
  const out = new Set<string>();
  for (const j of jobs) {
    if (j.queueAt && (j.phase === "uploading" || j.phase === "saving")) out.add(j.queueAt);
  }
  return [...out].sort();
}

/** True while a job is uploading or saving (warn before closing the tab). */
export function hasActiveUploads(): boolean {
  return state.jobs.some((j) => j.phase === "uploading" || j.phase === "saving");
}

// ---- single mounted tray ---------------------------------------------------
// The tray may be rendered by more than one host (the composer modal host and,
// later, the dashboard layout). Only the first mounted one paints.

let owner: symbol | null = null;
const ownerListeners = new Set<() => void>();

export function claimTray(token: symbol): void {
  if (owner == null) {
    owner = token;
    for (const l of ownerListeners) l();
  }
}

export function releaseTray(token: symbol): void {
  if (owner === token) {
    owner = null;
    for (const l of ownerListeners) l();
  }
}

export function useTrayOwner(): symbol | null {
  return useSyncExternalStore(
    (cb) => {
      ownerListeners.add(cb);
      return () => {
        ownerListeners.delete(cb);
      };
    },
    () => owner,
    () => owner,
  );
}
