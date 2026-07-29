import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  X,
} from "lucide-react";

export type PublishStatusPublication = {
  platform: string;
  status: string | null;
  connectedAccountId?: string | null;
  lastError?: string | null;
};

export type PublishStatusEvent = {
  id: string;
  phase: string;
  platform: string | null;
  message: string | null;
  createdAt: string;
};

function platformLabel(platform: string | null | undefined): string {
  if (!platform) return "Platform";
  if (platform === "twitter_x") return "X";
  return platform.replace(/_/g, " ");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}m ${rem}s`;
}

type DateTimeFormatOpts = {
  timezone: string | null;
  dateFormat: string | null;
  use24HourTimeFormat: boolean;
};

function formatLogTime(
  iso: string,
  formatDateTime: (d: Date, opts: DateTimeFormatOpts) => string,
  opts: DateTimeFormatOpts,
): string {
  return formatDateTime(new Date(iso), opts);
}

type RowState =
  | "published"
  | "failed"
  | "scheduled"
  | "queued"
  | "active"
  | "other";

function rowState(
  pubStatus: string | null,
  postStatus: string | null,
  isQueued: boolean,
): RowState {
  if (pubStatus === "published") return "published";
  if (pubStatus === "failed") return "failed";
  if (postStatus === "scheduled" && isQueued) return "queued";
  if (postStatus === "scheduled") return "scheduled";
  if (
    postStatus === "publishing" ||
    pubStatus === "publishing" ||
    pubStatus === "pending" ||
    pubStatus === "processing"
  ) {
    return "active";
  }
  if (pubStatus === "scheduled") return "scheduled";
  return "other";
}

export function PublishStatusSection({
  postStatus,
  isQueued = false,
  publications,
  events,
  timezone,
  dateFormat,
  use24HourTimeFormat,
  formatDateTime,
}: {
  postStatus: string | null;
  /** True when post is waiting in a queue slot (not a fixed schedule). */
  isQueued?: boolean;
  publications: PublishStatusPublication[];
  events: PublishStatusEvent[];
  timezone: string | null;
  dateFormat: string | null;
  use24HourTimeFormat: boolean;
  formatDateTime: (date: Date, opts: DateTimeFormatOpts) => string;
}) {
  const needsAttention = useMemo(() => {
    if (
      postStatus === "failed" ||
      postStatus === "partial" ||
      postStatus === "publishing"
    ) {
      return true;
    }
    // Queued/in-progress can expand; plain scheduled wait should stay quiet.
    if (postStatus === "scheduled" && isQueued) return true;
    return publications.some((p) => p.status === "failed");
  }, [postStatus, publications, isQueued]);

  const allSuccess =
    publications.length > 0 &&
    publications.every((p) => p.status === "published") &&
    (postStatus === "published" || postStatus == null);

  const [logOpen, setLogOpen] = useState(needsAttention);
  const [seenNeedsAttention, setSeenNeedsAttention] = useState(needsAttention);
  if (needsAttention !== seenNeedsAttention) {
    setSeenNeedsAttention(needsAttention);
    if (needsAttention) setLogOpen(true);
  }

  const durationLabel = useMemo(() => {
    if (events.length < 2) return null;
    const times = events.map((e) => new Date(e.createdAt).getTime());
    const ms = Math.max(...times) - Math.min(...times);
    if (ms < 0) return null;
    return formatDuration(ms);
  }, [events]);

  const showSection =
    publications.length > 0 ||
    events.length > 0 ||
    postStatus === "scheduled" ||
    postStatus === "publishing";

  if (!showSection) return null;

  const dateOpts = {
    timezone,
    dateFormat,
    use24HourTimeFormat,
  };

  const headline = (() => {
    if (postStatus === "scheduled" && isQueued) return "In queue";
    if (postStatus === "scheduled") return "Waiting for scheduled time";
    if (postStatus === "publishing") return "Publishing…";
    if (postStatus === "failed") return "Publish failed";
    if (postStatus === "partial") return "Partially published";
    if (allSuccess) return "Published successfully";
    return "Publish status";
  })();

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-text">Publish status</h2>
        <p
          className={`text-sm ${
            allSuccess
              ? "text-accent"
              : postStatus === "failed" || postStatus === "partial"
                ? "text-red-600 dark:text-red-400"
                : postStatus === "scheduled" && !isQueued
                  ? "text-blue-700 dark:text-blue-300"
                  : postStatus === "scheduled" && isQueued
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-text-muted"
          }`}
        >
          {headline}
          {allSuccess && durationLabel ? (
            <span className="text-text-muted"> · {durationLabel}</span>
          ) : null}
        </p>
      </div>

      {publications.length > 0 && (
        <ul className="space-y-2">
          {publications.map((pub) => {
            const state = rowState(pub.status, postStatus, isQueued);
            return (
              <li
                key={pub.connectedAccountId ?? pub.platform}
                className="flex items-start gap-2.5 text-sm"
              >
                <span className="mt-0.5 shrink-0">
                  {state === "published" ? (
                    <Check className="h-4 w-4 text-accent" aria-hidden />
                  ) : state === "failed" ? (
                    <X
                      className="h-4 w-4 text-red-600 dark:text-red-400"
                      aria-hidden
                    />
                  ) : state === "scheduled" ? (
                    <Clock
                      className="h-4 w-4 text-blue-600 dark:text-blue-400"
                      aria-hidden
                    />
                  ) : state === "queued" || state === "active" ? (
                    <Loader2
                      className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400"
                      aria-hidden
                    />
                  ) : (
                    <span className="inline-block h-4 w-4 rounded-full border border-border" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text capitalize">
                      {platformLabel(pub.platform)}
                    </span>
                    <span
                      className={`text-xs ${
                        state === "scheduled"
                          ? "text-blue-700 dark:text-blue-300"
                          : state === "queued" || state === "active"
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-text-muted"
                      }`}
                    >
                      {state === "published"
                        ? "Posted"
                        : state === "failed"
                          ? "Failed"
                          : state === "scheduled"
                            ? "Scheduled"
                            : state === "queued"
                              ? "Queued"
                              : state === "active"
                                ? "In progress"
                                : (pub.status ?? "—")}
                    </span>
                  </div>
                  {state === "failed" && pub.lastError ? (
                    <p className="mt-0.5 text-xs text-red-600 dark:text-red-400 break-words">
                      {pub.lastError}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!allSuccess && durationLabel && events.length > 0 ? (
        <p className="text-xs text-text-muted">Duration so far: {durationLabel}</p>
      ) : null}

      {events.length > 0 ? (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setLogOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors"
            aria-expanded={logOpen}
          >
            {logOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {logOpen ? "Hide detailed publish log" : "View detailed publish log"}
          </button>
          {logOpen && (
            <ol className="mt-3 space-y-2.5">
              {events.map((ev) => (
                <li key={ev.id} className="text-xs text-text-muted">
                  <span className="font-mono text-[11px] tabular-nums">
                    {formatLogTime(ev.createdAt, formatDateTime, dateOpts)}
                  </span>
                  <span className="mx-1.5 text-border">·</span>
                  {ev.platform ? (
                    <span className="capitalize text-text">
                      {platformLabel(ev.platform)}{" "}
                    </span>
                  ) : null}
                  <span className="text-text">
                    {ev.message ?? ev.phase.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : postStatus === "published" ||
        postStatus === "partial" ||
        postStatus === "failed" ? (
        <p className="border-t border-border pt-3 text-xs text-text-muted">
          No detailed publish log for this post.
        </p>
      ) : events.length === 0 &&
        (postStatus === "scheduled" || postStatus === "publishing") ? (
        <p className="text-xs text-text-muted">
          {postStatus === "publishing"
            ? "Events will appear here as each platform finishes."
            : "Detailed log appears once publishing starts."}
        </p>
      ) : null}
    </div>
  );
}
