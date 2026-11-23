import { getPostPublicationList, publishPost, type PublishOptions } from "@/api/publish";
import { apiUrl } from "@/lib/env";
import {
  getTrayJob,
  updateTrayJob,
  updateTrayRow,
  type TrayRow,
  type TrayRowStatus,
} from "./publish-store";

const POLL_MS = 2_500;
const SAFETY_POLL_MS = 6_000;
/** Same ceiling as the server stream (`MAX_STREAM_MS`). */
const MAX_TRACK_MS = 15 * 60 * 1_000;

type PublicationRow = Awaited<ReturnType<typeof getPostPublicationList>>[number];

function toStatus(raw: string, fallback: TrayRowStatus): TrayRowStatus {
  if (raw === "published") return "published";
  if (raw === "failed") return "failed";
  if (raw === "publishing" || raw === "processing") return "processing";
  return fallback;
}

function mergeRows(prev: TrayRow[], list: PublicationRow[]): TrayRow[] {
  const next = prev.map((r) => {
    const row = list.find((p) => p.connectedAccountId === r.accountId);
    if (!row) return r;
    const status = toStatus(row.publicationStatus, r.status);
    return {
      ...r,
      status,
      publicationId: row.publicationId,
      url: status === "published" ? row.platformPostUrl : r.url,
      error: status === "failed" ? (row.lastError ?? r.error ?? null) : null,
      errorKind: status === "failed" ? row.errorKind : null,
      handle: r.handle || (row.platformUsername ? `@${row.platformUsername}` : r.handle),
    };
  });
  for (const row of list) {
    if (next.some((r) => r.accountId === row.connectedAccountId)) continue;
    next.push({
      accountId: row.connectedAccountId,
      platform: row.platform,
      handle: row.platformUsername ? `@${row.platformUsername}` : row.platform,
      status: toStatus(row.publicationStatus, "waiting"),
      url: row.platformPostUrl,
      error: row.lastError,
      errorKind: row.errorKind,
      publicationId: row.publicationId,
    });
  }
  return next;
}

export function rowsResolved(rows: readonly TrayRow[]): boolean {
  return rows.length > 0 && rows.every((r) => r.status === "published" || r.status === "failed");
}

type JobProgressEventLike = {
  phase?: string;
  connectedAccountId?: string;
  message?: string;
};

/**
 * Follow a publish-now job into the tray: the job SSE stream
 * (`/api/jobs/:trackingId/stream`) for live per-network events, plus the
 * publication list for links and errors. Falls back to polling when the
 * stream can't open. Resolves when every network has published or failed
 * (or after 15 minutes).
 *
 * If the tray card is dismissed mid-publish, tracking stops early (nobody is
 * watching) unless `keepAfterDismiss` is set because the caller still needs
 * the final statuses (auto-repost / auto-plug on X).
 */
export function trackPublish(opts: {
  jobId: string;
  postId: string;
  streamUrl?: string | null;
  /** When set, run the publish here (server didn't auto-enqueue). */
  publishWith?: PublishOptions;
  /** Keep following after the tray card is dismissed. */
  keepAfterDismiss?: boolean;
}): Promise<TrayRow[]> {
  const { jobId, postId } = opts;
  return new Promise((resolve) => {
    let finished = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    const started = Date.now();
    // Our own copy, so the result survives the card being dismissed.
    let rows: TrayRow[] = getTrayJob(jobId)?.rows ?? [];

    const setRows = (fn: (prev: TrayRow[]) => TrayRow[]) => {
      rows = fn(getTrayJob(jobId)?.rows ?? rows);
      updateTrayJob(jobId, { rows });
    };
    const setRow = (accountId: string, patch: Partial<TrayRow>) =>
      setRows((prev) => prev.map((r) => (r.accountId === accountId ? { ...r, ...patch } : r)));

    const finish = () => {
      if (finished) return;
      finished = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      const final = getTrayJob(jobId)?.rows ?? rows;
      updateTrayJob(jobId, { phase: "done" });
      resolve(final);
    };

    /** True (and stops tracking) when the card is gone and nobody needs the result. */
    const abandoned = () => {
      if (opts.keepAfterDismiss || getTrayJob(jobId)) return false;
      finish();
      return true;
    };

    const refresh = async () => {
      if (finished || inFlight || abandoned()) return;
      inFlight = true;
      try {
        const list = await getPostPublicationList(postId);
        if (finished || abandoned()) return;
        setRows((prev) => mergeRows(prev, list));
        if (rowsResolved(rows)) finish();
      } catch {
        // transient; the next tick retries
      } finally {
        inFlight = false;
      }
      if (!finished && Date.now() - started > MAX_TRACK_MS) finish();
    };

    const refreshSoon = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 400);
    };

    const startPolling = (ms: number) => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => void refresh(), ms);
    };

    if (opts.streamUrl && typeof EventSource !== "undefined") {
      try {
        source = new EventSource(apiUrl(opts.streamUrl), { withCredentials: true });
        source.addEventListener("progress", (e) => {
          if (abandoned()) return;
          let ev: JobProgressEventLike | null;
          try {
            ev = JSON.parse((e as MessageEvent<string>).data) as JobProgressEventLike;
          } catch {
            ev = null;
          }
          if (ev?.connectedAccountId) {
            if (ev.phase === "platform_uploading" || ev.phase === "platform_queued") {
              setRow(ev.connectedAccountId, { status: "processing" });
            } else if (ev.phase === "platform_success") {
              setRow(ev.connectedAccountId, { status: "published" });
            } else if (ev.phase === "platform_failed") {
              // The stream has no errorKind; the refresh below fills it in.
              setRow(ev.connectedAccountId, {
                status: "failed",
                error: ev.message ?? null,
                errorKind: null,
              });
            }
          }
          refreshSoon();
        });
        source.addEventListener("done", () => {
          source?.close();
          source = null;
          void refresh().then(() => {
            // The stream says the job is over; anything still pending gets one
            // more look from the poller before we stop.
            if (!finished) startPolling(POLL_MS);
          });
        });
        source.onerror = () => {
          // Closed by the server (lifetime) or never opened: poll instead.
          source?.close();
          source = null;
          if (!finished) startPolling(POLL_MS);
        };
        startPolling(SAFETY_POLL_MS);
      } catch {
        source = null;
        startPolling(POLL_MS);
      }
    } else {
      startPolling(POLL_MS);
    }

    if (opts.publishWith) {
      // Runs every network on the API in this request (old forms' path for
      // Instagram reels / TikTok music). Progress comes from the poller.
      void publishPost(postId, opts.publishWith)
        .then((res) => {
          if (finished) return;
          if (!res.success && res.results.length === 0 && res.error) {
            setRows((prev) =>
              prev.map((r) =>
                r.status === "published"
                  ? r
                  : { ...r, status: "failed", error: res.error, errorKind: null },
              ),
            );
          }
          for (const r of res.results) {
            setRow(r.connectedAccountId, {
              status: r.status,
              url: r.platformPostUrl ?? undefined,
              error: r.error ?? null,
              errorKind: null,
            });
          }
        })
        .catch((err: unknown) => {
          if (finished) return;
          updateTrayJob(jobId, (j) => ({
            notes: [
              ...(j.notes ?? []),
              err instanceof Error ? err.message : "Publishing stopped responding. Check the post for results.",
            ],
          }));
        })
        .finally(() => void refresh());
    }

    void refresh();
  });
}

/** Retry one failed network (same call the post detail page uses). */
export async function retryPublication(jobId: string, postId: string, row: TrayRow): Promise<void> {
  updateTrayRow(jobId, row.accountId, {
    retrying: true,
    status: "processing",
    error: null,
    errorKind: null,
  });
  updateTrayJob(jobId, { phase: "publishing" });
  try {
    const res = await publishPost(postId, undefined, row.publicationId ?? undefined);
    const hit = res.results.find((r) => r.connectedAccountId === row.accountId);
    if (hit) {
      updateTrayRow(jobId, row.accountId, {
        status: hit.status,
        url: hit.platformPostUrl ?? undefined,
        error: hit.error ?? null,
      });
    } else if (!res.success) {
      updateTrayRow(jobId, row.accountId, {
        status: "failed",
        error: res.error ?? "Retry failed. Try again in a minute.",
      });
    }
    try {
      const list = await getPostPublicationList(postId);
      updateTrayJob(jobId, (j) => ({ rows: mergeRows(j.rows, list) }));
    } catch {
      // keep what the publish call returned
    }
  } catch (err) {
    updateTrayRow(jobId, row.accountId, {
      status: "failed",
      error: err instanceof Error ? err.message : "Retry failed. Try again in a minute.",
    });
  } finally {
    updateTrayRow(jobId, row.accountId, { retrying: false });
    updateTrayJob(jobId, { phase: "done" });
  }
}
