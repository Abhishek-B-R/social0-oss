import { createPost } from "@/api/posts";
import { fetchApi } from "@/lib/fetch-api";
import { uploadFile } from "@/lib/upload-file";
import { toClientErrorMessage } from "@/lib/client-error-message";
import type { ImportMode } from "./bulk-import-model";

/*
 * Runs a bulk import: upload every file (a few at a time), then create one
 * post per file in order. A failed row never stops the others; each row gets
 * its own result so the review step can show it and offer a retry.
 */

export type ImportJob = {
  rowId: string;
  file: File;
  /** Reuse an earlier upload (retry after a failed create). */
  mediaId?: string;
  caption: string;
  accountIds: string[];
  scheduledAt: Date | null;
  metadata: Record<string, unknown>;
};

export type ImportPhase = "uploading" | "creating";

export type ImportCallbacks = {
  onPhase: (phase: ImportPhase, total: number) => void;
  /** 0-100 across all uploads, weighted by file size. */
  onUploadProgress: (percent: number) => void;
  onUploaded: (rowId: string, mediaId: string) => void;
  /** 1-based index of the post being created. */
  onCreating: (index: number) => void;
  onRowDone: (rowId: string, postId: string) => void;
  onRowFailed: (rowId: string, error: string) => void;
};

export type QueueSlot = { slotId: string; scheduledAt: Date; label: string };

export type NextSlotResult =
  | { ok: true; slot: QueueSlot | null; timezone: string }
  | { ok: false; error: string };

/** `GET /api/queue/next-slot`: next open posting-schedule slot, or null. */
export async function fetchNextQueueSlot(signal?: AbortSignal): Promise<NextSlotResult> {
  try {
    const res = await fetchApi("/api/queue/next-slot", { signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: toClientErrorMessage(text, "Couldn't read your posting schedule."),
      };
    }
    const data = (await res.json()) as {
      available?: boolean;
      slotId?: string;
      scheduledAt?: string;
      scheduledFor?: string;
      displayLabel?: string;
      displayTime?: string;
      timezone?: string;
    };
    const tz = data.timezone ?? "UTC";
    const at = data.scheduledAt ?? data.scheduledFor;
    if (!data.available || !data.slotId || !at) {
      return { ok: true, slot: null, timezone: tz };
    }
    return {
      ok: true,
      timezone: tz,
      slot: {
        slotId: data.slotId,
        scheduledAt: new Date(at),
        label: data.displayLabel ?? data.displayTime ?? "",
      },
    };
  } catch (e) {
    if (signal?.aborted) return { ok: false, error: "Cancelled" };
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't read your posting schedule.",
    };
  }
}

const UPLOAD_CONCURRENCY = 3;

/** Generous per-file timeout: at least 2 min, or ~200KB/s for big videos. */
function uploadTimeout(bytes: number): number {
  return Math.max(120_000, Math.ceil(bytes / (200 * 1024)) * 1000);
}

export type ImportSummary = {
  done: number;
  failed: number;
  cancelled: boolean;
};

export async function runBulkImport(
  jobs: ImportJob[],
  mode: ImportMode,
  signal: AbortSignal,
  cb: ImportCallbacks,
): Promise<ImportSummary> {
  let done = 0;
  let failed = 0;
  const fail = (rowId: string, error: string) => {
    failed += 1;
    cb.onRowFailed(rowId, error);
  };

  // Phase 1: uploads (skips rows that already have media from an earlier try).
  const toUpload = jobs.filter((j) => !j.mediaId);
  const mediaByRow = new Map<string, string>();
  for (const j of jobs) if (j.mediaId) mediaByRow.set(j.rowId, j.mediaId);

  if (toUpload.length > 0) {
    cb.onPhase("uploading", toUpload.length);
    const totalBytes = toUpload.reduce((n, j) => n + Math.max(1, j.file.size), 0);
    const loaded = new Map<string, number>();
    const report = () => {
      let sum = 0;
      for (const v of loaded.values()) sum += v;
      cb.onUploadProgress(Math.min(100, Math.round((sum / totalBytes) * 100)));
    };
    let next = 0;
    const worker = async () => {
      while (next < toUpload.length && !signal.aborted) {
        const job = toUpload[next++];
        const size = Math.max(1, job.file.size);
        try {
          const media = await uploadFile(
            job.file,
            0,
            (_i, percent) => {
              loaded.set(job.rowId, (percent / 100) * size);
              report();
            },
            { signal, timeoutMs: uploadTimeout(job.file.size) },
          );
          loaded.set(job.rowId, size);
          report();
          mediaByRow.set(job.rowId, media.id);
          cb.onUploaded(job.rowId, media.id);
        } catch (e) {
          loaded.set(job.rowId, size);
          report();
          if (signal.aborted) return;
          fail(job.rowId, e instanceof Error ? `Upload failed: ${e.message}` : "Upload failed.");
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, toUpload.length) }, worker),
    );
  }

  if (signal.aborted) return { done, failed, cancelled: true };

  // Phase 2: create posts in order (queue slots are taken one after another).
  const creatable = jobs.filter((j) => mediaByRow.has(j.rowId));
  cb.onPhase("creating", creatable.length);
  for (let i = 0; i < creatable.length; i++) {
    if (signal.aborted) return { done, failed, cancelled: true };
    const job = creatable[i];
    cb.onCreating(i + 1);
    const mediaId = mediaByRow.get(job.rowId)!;
    try {
      let scheduledAt = job.scheduledAt;
      let slotId: string | null = null;
      if (mode === "queue") {
        const next = await fetchNextQueueSlot(signal);
        if (!next.ok) {
          fail(job.rowId, next.error);
          continue;
        }
        if (!next.slot) {
          // No open slot now means none for the rest either.
          for (const rest of creatable.slice(i)) {
            fail(rest.rowId, "No open time left in your posting schedule. Add more times, then retry.");
          }
          break;
        }
        scheduledAt = next.slot.scheduledAt;
        slotId = next.slot.slotId;
      }
      const res = await createPost(
        job.caption,
        job.accountIds,
        mode === "draft" ? "draft" : "scheduled",
        mode === "draft" ? null : scheduledAt,
        [mediaId],
        job.metadata,
        slotId,
      );
      if (res.success) {
        done += 1;
        cb.onRowDone(job.rowId, res.postId);
      } else {
        fail(job.rowId, res.error);
      }
    } catch (e) {
      if (signal.aborted) return { done, failed, cancelled: true };
      fail(job.rowId, e instanceof Error ? e.message : "Couldn't create this post.");
    }
  }

  return { done, failed, cancelled: false };
}
