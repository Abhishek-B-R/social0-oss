"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Loader2,
  Upload,
  Send,
  Image,
  Video,
  Layers,
  Check,
  X,
  Clock,
} from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";

const PUBLISH_ESCAPE_MS = 2 * 60 * 1000; // 4 minutes

export type OverlayPhase = "uploading" | "publishing" | "saving";

export type ResurfacePreFill = {
  intervalHours?: number;
  maxResurfaces?: number;
  plugComment?: string;
};

export type PlatformStatus = "waiting" | "processing" | "published" | "failed";

export type PlatformResult = {
  platform: string;
  accountId: string;
  accountName: string;
  status: PlatformStatus;
  error?: string;
  /** When status is "published", link to the post on that platform */
  postUrl?: string | null;
};

type UploadPublishOverlayProps = {
  phase: OverlayPhase;
  /** e.g. "2 of 5" or "Finalizing upload..." when at 95%+ */
  uploadProgress?: string | null;
  /** 0–100 upload percentage for granular progress bar; at 95+ we show indeterminate + "Finalizing upload..." */
  uploadPercent?: number | null;
  /** When true, show a tab-close warning under the progress bar */
  showUploadWarning?: boolean;
  /** "image" | "video" | "mixed" for upload phase label */
  mediaType?: "image" | "video" | "mixed";
  /** When publishing: show "Scheduling" vs "Publishing" */
  isScheduling?: boolean;
  /** After publishing: show success state with links */
  showLinks?: boolean;
  /** When showLinks and post was published to X, show Auto-Repost section */
  publishedPostId?: string | null;
  publishedToX?: boolean;
  resurfacePreFill?: ResurfacePreFill | null;
  /** Per-platform status for publishing progress (real-time rows) */
  platformStatuses?: PlatformResult[];
  /** All platforms have resolved (published or failed); show summary and Close */
  allDone?: boolean;
  /** Called when user clicks Close after all done */
  onClose?: () => void;
  /** When uploading: called when user clicks cancel (X). Optional. */
  onCancelUpload?: () => void;
};

function MediaTypeIcon({ type }: { type: "image" | "video" | "mixed" }) {
  // eslint-disable-next-line jsx-a11y/alt-text
  if (type === "image") return <Image className="h-6 w-6 text-emerald-600" />;
  if (type === "video") return <Video className="h-6 w-6 text-emerald-600" />;
  return <Layers className="h-6 w-6 text-emerald-600" />;
}

function mediaTypeLabel(type: "image" | "video" | "mixed"): string {
  if (type === "image") return "Image";
  if (type === "video") return "Video";
  return "Media";
}

const PLEASE_DONT_CLOSE = (
  <p className="mt-3 text-xs text-text-muted">
    Please don&apos;t close this window.
  </p>
);

function PlatformStatusLabel({
  status,
  error,
}: {
  status: PlatformStatus;
  error?: string;
}) {
  if (status === "waiting") {
    return (
      <span className="flex items-center gap-1.5 text-text-muted text-sm">
        <Clock className="h-3.5 w-3.5" />
        Waiting…
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="flex items-center gap-1.5 text-accent text-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Processing…
      </span>
    );
  }
  if (status === "published") {
    return (
      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
        <Check className="h-3.5 w-3.5" />
        Published
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-sm"
      title={error}
    >
      <X className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate max-w-[180px]">{error ?? "Failed"}</span>
    </span>
  );
}

export function UploadPublishOverlay({
  phase,
  uploadProgress,
  uploadPercent = null,
  mediaType = "image",
  isScheduling = false,
  showLinks = false,
  publishedPostId = null,
  platformStatuses = [],
  allDone = false,
  onClose,
  onCancelUpload,
}: UploadPublishOverlayProps) {
  void onClose; // kept for API compatibility; success screen uses Links only
  const [showLongRunningEscape, setShowLongRunningEscape] = useState(false);
  const escapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUploading = phase === "uploading";
  const isSavingDraft = phase === "saving";
  const showPlatformRows =
    phase === "publishing" && platformStatuses.length > 0 && !isScheduling;
  const isFinalizing = typeof uploadPercent === "number" && uploadPercent >= 95;

  useEffect(() => {
    if (phase !== "publishing" || allDone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowLongRunningEscape(false);
      if (escapeTimerRef.current) {
        clearTimeout(escapeTimerRef.current);
        escapeTimerRef.current = null;
      }
      return;
    }
    escapeTimerRef.current = setTimeout(() => {
      setShowLongRunningEscape(true);
      escapeTimerRef.current = null;
    }, PUBLISH_ESCAPE_MS);
    return () => {
      if (escapeTimerRef.current) {
        clearTimeout(escapeTimerRef.current);
        escapeTimerRef.current = null;
      }
    };
  }, [phase, allDone]);

  return (
    <div
      className="fixed inset-0 left-0 z-50 flex items-center justify-center bg-bg/70 backdrop-blur-[2px] dark:bg-black/70 lg:left-64"
      aria-live="polite"
      aria-busy={!showLinks}
    >
      <div className="relative mx-4 flex max-w-md flex-col items-center text-center">
        {showLinks && !(showPlatformRows && allDone) ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100/90 dark:bg-emerald-500/20">
              <Send className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-text">
              Post published!
            </h2>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/dashboard/composer"
                className="w-full rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-semibold text-white text-center transition hover:bg-emerald-600"
              >
                Create another post
              </Link>

              <Link
                href={
                  publishedPostId
                    ? `/dashboard/posts/${publishedPostId}`
                    : "/dashboard/posts"
                }
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3.5 text-sm font-semibold text-zinc-200 text-center transition hover:bg-zinc-900"
              >
                View post
              </Link>
            </div>
          </>
        ) : isUploading ? (
          <>
            {onCancelUpload && (
              <button
                type="button"
                onClick={onCancelUpload}
                className="absolute -top-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-muted shadow-sm hover:bg-bg-muted hover:text-text transition-colors"
                aria-label="Cancel upload"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100/90 dark:bg-emerald-500/20">
              <Upload className="h-7 w-7 animate-pulse text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-text">
              {isFinalizing
                ? "Finalizing upload…"
                : `Uploading ${mediaTypeLabel(mediaType).toLowerCase()}${uploadProgress ? ` · ${uploadProgress}` : ""}…`}
            </h2>
            {(uploadProgress || mediaType) && (
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-text-muted">
                <MediaTypeIcon type={mediaType} />
                {mediaTypeLabel(mediaType)}
                {isFinalizing
                  ? " Finalizing upload…"
                  : uploadProgress
                    ? ` ${uploadProgress}`
                    : ""}
              </p>
            )}
            {typeof uploadPercent === "number" && (
              <div className="mt-4 w-full max-w-sm space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-muted">
                    {isFinalizing ? (
                      <div className="h-full w-full bg-emerald-500 animate-pulse" />
                    ) : (
                      <div
                        className="h-full bg-emerald-500 transition-all duration-200"
                        style={{ width: `${uploadPercent}%` }}
                      />
                    )}
                  </div>
                  <span className="text-xs font-medium text-text-muted shrink-0">
                    {isFinalizing ? "Finalizing…" : `${uploadPercent}%`}
                  </span>
                </div>
              </div>
            )}
          </>
        ) : isSavingDraft ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100/90 dark:bg-emerald-500/20">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-text">
              Saving this post…
            </h2>
            <p className="mt-2 text-sm text-text-muted">Saving to drafts.</p>
          </>
        ) : phase === "publishing" && showLongRunningEscape ? (
          <>
            <div className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 sm:p-8 shadow-sm text-center">
              <p className="text-text">
                Your post is being processed. This can take a few minutes — you
                can check your post status in your posts list.
              </p>
              <Link
                href={
                  publishedPostId
                    ? `/dashboard/posts/${publishedPostId}`
                    : "/dashboard/posts"
                }
                className="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Go to Posts
              </Link>
            </div>
          </>
        ) : showPlatformRows ? (
          <>
            <div className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 sm:p-8 shadow-sm text-left">
              {allDone ? (
                <>
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100/90 dark:bg-emerald-500/20">
                      <Send className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h2 className="mt-4 text-xl font-semibold text-text">
                      Post published!
                    </h2>
                  </div>
                  <ul className="mt-6 space-y-4">
                    {platformStatuses.map((p) => (
                      <li
                        key={p.accountId}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <PlatformIcon
                            platform={p.platform}
                            className="h-5 w-5 shrink-0 text-text-muted"
                            size={20}
                          />
                          <span className="truncate text-sm font-medium text-text">
                            {p.accountName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {p.status === "published" && p.postUrl && (
                            <a
                              href={p.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text hover:bg-bg-muted transition-colors"
                            >
                              View
                            </a>
                          )}
                          <PlatformStatusLabel
                            status={p.status}
                            error={p.error}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 flex flex-col gap-3">
                    <Link
                      href="/dashboard/composer"
                      className="order-1 flex-1 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors text-center"
                    >
                      Create another post
                    </Link>
                    <Link
                      href={
                        publishedPostId
                          ? `/dashboard/posts/${publishedPostId}`
                          : "/dashboard/posts"
                      }
                      className="order-2 flex-1 rounded-xl border border-border bg-bg px-5 py-3 text-sm font-semibold text-text hover:bg-bg-muted transition-colors text-center"
                    >
                      View post
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-text">
                    Publishing to all platforms…
                  </h2>
                  <ul className="mt-6 space-y-4">
                    {platformStatuses.map((p) => (
                      <li
                        key={p.accountId}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <PlatformIcon
                            platform={p.platform}
                            className="h-5 w-5 shrink-0 text-text-muted"
                            size={20}
                          />
                          <span className="truncate text-sm font-medium text-text">
                            {p.accountName}
                          </span>
                        </div>
                        <PlatformStatusLabel
                          status={p.status}
                          error={p.error}
                        />
                      </li>
                    ))}
                  </ul>
                  {PLEASE_DONT_CLOSE}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100/90 dark:bg-emerald-500/20">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-text">
              {isScheduling ? "Scheduling post…" : "Publishing post…"}
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              {isScheduling
                ? "Your post is being scheduled to all selected platforms."
                : "Hang tight while we publish your post."}
            </p>
            <p className="mt-3 rounded-lg bg-bg-muted/90 px-4 py-2 text-xs text-text-muted">
              {isScheduling
                ? "Scheduled posts will go out at the times you set."
                : "Posts can take up to a few minutes to show on all platforms."}
            </p>
            <p className="mt-2 text-xs text-text-muted">
              You don&apos;t need to keep waiting here, feel free to{" "}
              <Link
                href="/dashboard/composer"
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                create/schedule another post
              </Link>{" "}
              while this one finishes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
