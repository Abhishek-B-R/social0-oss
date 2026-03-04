"use client";

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
};

type UploadPublishOverlayProps = {
  phase: OverlayPhase;
  /** e.g. "2 of 5" – we show "Uploading 2 of 5" and media type */
  uploadProgress?: string | null;
  /** 0–100 upload percentage for granular progress bar */
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
};

const DONT_KEEP_WAITING = (
  <p className="mt-4 text-sm text-text-muted">
    Don&apos;t keep waiting — if you have another post idea,{" "}
    <Link
      href="/dashboard/composer"
      className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
    >
      post/schedule
    </Link>{" "}
    it as well :)
  </p>
);

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
  showUploadWarning = false,
  mediaType = "image",
  isScheduling = false,
  showLinks = false,
  publishedPostId = null,
  platformStatuses = [],
  allDone = false,
  onClose,
}: UploadPublishOverlayProps) {
  const isUploading = phase === "uploading";
  const isSavingDraft = phase === "saving";
  const showPlatformRows =
    phase === "publishing" && platformStatuses.length > 0 && !isScheduling;

  return (
    <div
      className="fixed inset-0 left-0 z-50 flex items-center justify-center bg-bg/70 backdrop-blur-[2px] dark:bg-black/70 lg:left-64"
      aria-live="polite"
      aria-busy={!showLinks}
    >
      <div className="mx-4 flex max-w-md flex-col items-center text-center">
        {showLinks ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100/90 dark:bg-emerald-500/20">
              <Send className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-text">
              Post published
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Your post is being sent to all selected platforms. It can take a
              few minutes to appear everywhere.
            </p>
            {DONT_KEEP_WAITING}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard/composer"
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Create another post
              </Link>
              <Link
                href={
                  publishedPostId
                    ? `/dashboard/posts/${publishedPostId}`
                    : "/dashboard/posts"
                }
                className="rounded-xl border border-border bg-bg px-5 py-2.5 text-sm font-semibold text-text hover:bg-bg-muted transition-colors"
              >
                {publishedPostId ? "View post" : "View posts"}
              </Link>
            </div>
          </>
        ) : isUploading ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100/90 dark:bg-emerald-500/20">
              <Upload className="h-7 w-7 animate-pulse text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-text">
              Uploading {mediaTypeLabel(mediaType).toLowerCase()}
              {uploadProgress ? ` · ${uploadProgress}` : ""}…
            </h2>
            {(uploadProgress || mediaType) && (
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-text-muted">
                <MediaTypeIcon type={mediaType} />
                {mediaTypeLabel(mediaType)}
                {uploadProgress ? ` ${uploadProgress}` : ""}
              </p>
            )}
            {typeof uploadPercent === "number" && (
              <div className="mt-4 w-full max-w-sm space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-muted">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-200"
                      style={{ width: `${uploadPercent}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-text-muted">
                    Uploading {mediaTypeLabel(mediaType).toLowerCase()}
                    {uploadProgress ? ` ${uploadProgress}` : ""}…{" "}
                    {uploadPercent}%
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
            {DONT_KEEP_WAITING}
          </>
        ) : showPlatformRows ? (
          <>
            <div className="w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-4 shadow-sm text-left">
              <h2 className="text-lg font-semibold text-text">
                {allDone
                  ? "Publishing complete"
                  : "Publishing to all platforms…"}
              </h2>
              {allDone && (
                <p className="mt-1 text-sm text-text-muted">
                  {platformStatuses.some((p) => p.status === "failed")
                    ? "Published with errors"
                    : "All done!"}
                </p>
              )}
              <ul className="mt-4 space-y-3">
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
                    <PlatformStatusLabel status={p.status} error={p.error} />
                  </li>
                ))}
              </ul>
              {!allDone && PLEASE_DONT_CLOSE}
              {allDone && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                >
                  Close
                </button>
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
                : "Publishing your post to all the places."}
            </p>
            <p className="mt-3 rounded-lg bg-bg-muted/90 px-4 py-2 text-xs text-text-muted">
              {isScheduling
                ? "Scheduled posts will go out at the times you set."
                : "Posts can take up to a few minutes to show on all platforms."}
            </p>
            {DONT_KEEP_WAITING}
          </>
        )}
      </div>
    </div>
  );
}
