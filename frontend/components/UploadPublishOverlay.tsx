"use client";

import Link from "next/link";
import { Loader2, Upload, Send, Image, Video, Layers } from "lucide-react";
import { ResurfaceSetup } from "@/components/repost/ResurfaceSetup";

export type OverlayPhase = "uploading" | "publishing" | "saving";

export type ResurfacePreFill = {
  intervalHours?: number;
  maxResurfaces?: number;
  plugComment?: string;
};

type UploadPublishOverlayProps = {
  phase: OverlayPhase;
  /** e.g. "2 of 5" – we show "Uploading 2 of 5" and media type */
  uploadProgress?: string | null;
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
};

const DONT_KEEP_WAITING = (
  <p className="mt-4 text-sm text-text-muted">
    Don&apos;t keep waiting — if you have another post idea,{" "}
    <Link
      href="/dashboard/create"
      className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
    >
      post/schedule
    </Link>{" "}
    it as well :)
  </p>
);

function MediaTypeIcon({ type }: { type: "image" | "video" | "mixed" }) {
  if (type === "image") return <Image className="h-6 w-6 text-emerald-600" />;
  if (type === "video") return <Video className="h-6 w-6 text-emerald-600" />;
  return <Layers className="h-6 w-6 text-emerald-600" />;
}

function mediaTypeLabel(type: "image" | "video" | "mixed"): string {
  if (type === "image") return "Image";
  if (type === "video") return "Video";
  return "Media";
}

export function UploadPublishOverlay({
  phase,
  uploadProgress,
  mediaType = "image",
  isScheduling = false,
  showLinks = false,
  publishedPostId = null,
  publishedToX = false,
  resurfacePreFill = null,
}: UploadPublishOverlayProps) {
  const isUploading = phase === "uploading";
  const isSavingDraft = phase === "saving";
  const isPublishing = phase === "publishing" && !showLinks;

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
                href="/dashboard/create"
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Create another post
              </Link>
              <Link
                href={publishedPostId ? `/dashboard/posts/${publishedPostId}` : "/dashboard/posts"}
                className="rounded-xl border border-border bg-bg px-5 py-2.5 text-sm font-semibold text-text hover:bg-bg-muted transition-colors"
              >
                View posts
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
            {DONT_KEEP_WAITING}
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
