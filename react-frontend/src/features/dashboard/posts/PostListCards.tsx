
import { useNavigate } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import Link from "@/components/AppLink";
import { AlertCircle, MoreHorizontal } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import { PlatformIcon } from "@/components/PlatformIcon";
import type { PublicationRow } from "./posts-list-types";
import { publishPost } from "@/api/publish";
import { deletePost } from "@/api/posts";
import { usePostHog } from "@posthog/react";
import { capturePostAction } from "@/lib/posthog-events";
import { PostAgainButton } from "./PostAgainButton";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type PostRow = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: Date | null;
  failureReason: string | null;
  createdAt: Date | null;
  mediaIds: string[] | null;
  metadata?: Record<string, unknown> | null;
};

type ThreadPreview = {
  parts: string[];
  isThread: boolean;
};

type QuickActionStatus = "published" | "failed" | "scheduled" | "draft";

function toComposerSlug(
  displayType: string,
): "text" | "image" | "video" | "threads" | "collection" {
  if (displayType === "Thread") return "threads";
  if (displayType === "Collection") return "collection";
  if (displayType === "Image") return "image";
  if (displayType === "Video") return "video";
  return "text";
}

function getThreadPreview(post: PostRow): ThreadPreview {
  const meta = post.metadata as
    | {
        contentType?: string;
        twitterThread?: { parts?: { text: string }[] };
      }
    | undefined;
  const contentType = meta?.contentType;
  if (contentType === "threads") {
    return {
      parts: [post.originalContent ?? "(No caption)"],
      isThread: true,
    };
  }
  const partsArr = meta?.twitterThread?.parts;
  if (Array.isArray(partsArr) && partsArr.length > 0) {
    const parts = partsArr.map((p) => {
      const t =
        typeof p === "object" && p && "text" in p
          ? String((p as { text: string }).text).trim()
          : "";
      return t || "(No caption)";
    });
    return { parts, isThread: true };
  }
  const raw = post.originalContent ?? "";
  const segments = raw
    .split(/\n\s*---\s*\n|\s+---\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length > 1) {
    return { parts: segments, isThread: true };
  }
  return { parts: [raw || "(No caption)"], isThread: false };
}

function getDisplayType(
  post: PostRow,
  partCount: number,
  firstMime: string,
  mediaIds: string[],
  isThread: boolean,
): string {
  const meta = post.metadata as { contentType?: string } | undefined;
  const contentType = meta?.contentType;

  // Respect original form semantics: if a post was created via a specific
  // content type form, keep that label forever.
  if (contentType === "threads") return "Thread";
  if (contentType === "collection") return "Collection";
  if (contentType === "image") return "Image";
  if (contentType === "video") return "Video";
  if (contentType === "text") return "Text";

  // Fallbacks for older posts without contentType metadata.
  if (isThread) return "Thread";
  if (mediaIds.length > 1) return "Collection";
  if (firstMime.startsWith("video/")) return "Video";
  if (mediaIds.length === 1 && firstMime.startsWith("image/")) return "Image";
  return "Text";
}

function getUiStatus(post: PostRow): string {
  if (post.status === "publishing" && post.createdAt) {
    const createdMs = new Date(post.createdAt).getTime();
    const ageMs = Date.now() - createdMs;
    const TEN_MIN_MS = 10 * 60 * 1000;
    if (ageMs > TEN_MIN_MS) {
      return "failed";
    }
  }
  return post.status ?? "draft";
}

function getTimestampLabel(
  post: PostRow,
  publications: { publishedAt: Date | null }[],
  options: {
    use24HourTimeFormat: boolean;
    dateFormat?: string | null;
    timezone?: string | null;
  },
): string {
  const effectiveStatus = getUiStatus(post);
  const fmt = (d: Date) =>
    formatDateTime(d, {
      use24HourTimeFormat: options.use24HourTimeFormat,
      dateFormat: options.dateFormat,
      timezone: options.timezone,
    });
  if (effectiveStatus === "scheduled" && post.scheduledAt) {
    return `Scheduled for ${fmt(new Date(post.scheduledAt))}`;
  }
  if (effectiveStatus === "published") {
    const publishedAts = publications
      .map((p) => p.publishedAt)
      .filter((d): d is Date => d != null);
    const publishedAt =
      publishedAts.length > 0
        ? new Date(Math.min(...publishedAts.map((d) => new Date(d).getTime())))
        : null;
    return publishedAt ? `Posted at ${fmt(publishedAt)}` : "Posted";
  }
  return post.createdAt ? `Created ${fmt(new Date(post.createdAt))}` : "-";
}

/** Status pill: label + optional prefix character. */
function getStatusBadge(status: string | null): {
  label: string;
  className: string;
  prefix: string;
} {
  switch (status) {
    case "published":
      return {
        label: "Posted",
        prefix: "●",
        className: "bg-accent text-accent-foreground",
      };
    case "partial":
      return {
        label: "Partial",
        prefix: "◐",
        className: "bg-purple-600 text-white",
      };
    case "publishing":
      return {
        label: "Publishing",
        prefix: "◌",
        className: "bg-amber-400 text-amber-950",
      };
    case "scheduled":
      return {
        label: "Scheduled",
        prefix: "◷",
        className: "bg-blue-600 text-white",
      };
    case "failed":
      return {
        label: "Failed",
        prefix: "✕",
        className:
          "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
      };
    default:
      return {
        label: "Draft",
        prefix: "○",
        className: "bg-muted text-foreground",
      };
  }
}

function getFriendlyFailureReason(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const lower = raw.toLowerCase();
  if (
    lower.includes("token") ||
    lower.includes("oauth") ||
    lower.includes("invalid_grant") ||
    lower.includes("unauthorized")
  ) {
    return "Publishing failed due to an account authorization issue. Please reconnect and try again.";
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("429")
  ) {
    return "Publishing failed due to temporary rate limits. Please try again shortly.";
  }
  return "Publishing failed. Please review your post settings and try again.";
}

function QuickActionsMenu({
  postId,
  status,
  composerSlug,
}: {
  postId: string;
  status: QuickActionStatus;
  composerSlug: "text" | "image" | "video" | "threads" | "collection";
}) {
  const navigate = useNavigate();
  const invalidateQueries = useInvalidateQueries();
  const posthog = usePostHog();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
      setOpen(false);
      invalidateQueries();
    } finally {
      setLoading(false);
    }
  };

  const menuClass =
    "block w-full rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-60";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Open quick actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-card p-1 shadow-lg"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {status === "published" && (
            <>
              <PostAgainButton
                postId={postId}
                variant="menu"
                onStarted={() => setOpen(false)}
              />
              <Link
                href={`/dashboard/create/${composerSlug}?edit=${postId}`}
                className={menuClass}
                onClick={() => setOpen(false)}
              >
                Edit and post
              </Link>
            </>
          )}
          {status === "failed" && (
            <>
              <button
                type="button"
                disabled={loading}
                className={menuClass}
                onClick={() =>
                  void run(async () => {
                    const result = await publishPost(postId);
                    if (result.error) {
                      toast.error("Failed to publish post. Please try again.");
                      throw new Error("retry_failed");
                    }
                    capturePostAction(posthog, "post_published", {
                      source: "posts_list_retry",
                      post_status: status,
                    });
                  })
                }
              >
                Retry
              </button>
              <Link
                href={`/dashboard/create/${composerSlug}?edit=${postId}`}
                className={menuClass}
                onClick={() => setOpen(false)}
              >
                Edit and post
              </Link>
            </>
          )}
          {status === "scheduled" && (
            <>
              <Link
                href={`/dashboard/create/${composerSlug}?scheduled=${postId}`}
                className={menuClass}
                onClick={() => setOpen(false)}
              >
                Edit
              </Link>
              <button
                type="button"
                disabled={loading}
                className={menuClass}
                onClick={() =>
                  void run(async () => {
                    const result = await publishPost(postId);
                    if (result.error) {
                      toast.error("Failed to publish post. Please try again.");
                      throw new Error("publish_now_failed");
                    }
                    capturePostAction(posthog, "post_published", {
                      source: "posts_list_publish_now",
                      post_status: status,
                    });
                  })
                }
              >
                Publish now
              </button>
              <button
                type="button"
                disabled={loading}
                className={menuClass}
                onClick={() =>
                  void run(async () => {
                    const result = await deletePost(postId);
                    if (!result.success) {
                      toast.error("Failed to cancel post. Please try again.");
                      throw new Error("cancel_failed");
                    }
                    capturePostAction(posthog, "post_cancelled", {
                      source: "posts_list",
                      post_status: status,
                    });
                  })
                }
              >
                Cancel
              </button>
            </>
          )}
          {status === "draft" && (
            <>
              <Link
                href={`/dashboard/create/${composerSlug}?draft=${postId}`}
                className={menuClass}
                onClick={() => setOpen(false)}
              >
                Edit
              </Link>
              <button
                type="button"
                disabled={loading}
                className={menuClass}
                onClick={() =>
                  void run(async () => {
                    const result = await deletePost(postId);
                    if (!result.success) {
                      toast.error("Failed to delete draft. Please try again.");
                      throw new Error("delete_draft_failed");
                    }
                    capturePostAction(posthog, "post_deleted", {
                      source: "posts_list",
                      post_status: status,
                    });
                  })
                }
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const MAX_PLATFORM_ICONS = 3;

export type ResurfaceForPost = {
  id: string;
  isActive: boolean;
  resurfacesDone: number;
  maxResurfaces: number;
  intervalHours: number;
  plugComment: string | null;
};

export type AutoPlugForPost = { status: string };

export function PostListCards({
  userPosts,
  publicationsByPostId,
  firstMediaByPost,
  resurfaceByPostId = {},
  queuedPostIds,
  emptyMessage = "You haven't created any posts yet.",
  filterMessage = "No posts match your filters.",
  hasActiveFilters,
  use24HourTimeFormat = false,
  dateFormat = "dd/MM/yyyy",
  timezone,
}: {
  userPosts: PostRow[];
  publicationsByPostId: Record<string, PublicationRow[]>;
  firstMediaByPost: Map<
    string,
    { mimeType: string; originalFilename: string | null }
  >;
  resurfaceByPostId?: Record<string, ResurfaceForPost>;
  /** When provided, posts in this set show a "Queued" badge instead of "Scheduled" */
  queuedPostIds?: Set<string>;
  emptyMessage?: string;
  filterMessage?: string;
  hasActiveFilters?: boolean;
  use24HourTimeFormat?: boolean;
  dateFormat?: string | null;
  timezone?: string | null;
}) {
  if (userPosts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <p className="mb-4 font-medium text-muted-foreground">
          {hasActiveFilters ? filterMessage : emptyMessage}
        </p>
        <Link
          href="/dashboard/composer"
          className="inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-lg transition-colors hover:bg-accent-hover"
        >
          Create your first post
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {userPosts.map((post) => {
        const mediaMeta = firstMediaByPost.get(post.id);
        const mime = mediaMeta?.mimeType ?? "";
        const { parts, isThread } = getThreadPreview(post);
        const partCount = parts.length;
        const mediaIds = post.mediaIds ?? [];
        const displayType = getDisplayType(
          post,
          partCount,
          mime,
          mediaIds,
          isThread,
        );
        const uiStatus = getUiStatus(post);
        const timestampLabel = getTimestampLabel(
          post,
          publicationsByPostId[post.id] ?? [],
          { use24HourTimeFormat, dateFormat, timezone },
        );

        const PREVIEW_LEN = 120;
        const firstPart = (parts[0] ?? "").trim();
        const hasCaption = firstPart.length > 0;
        const preview = hasCaption
          ? firstPart.length > PREVIEW_LEN
            ? `${firstPart.slice(0, PREVIEW_LEN)}…`
            : firstPart
          : "No caption";

        const publicationsList = publicationsByPostId[post.id] ?? [];
        const isQueued = queuedPostIds?.has(post.id);
        const statusBadge = isQueued
          ? {
              label: "Queued",
              prefix: "▸",
              className: "bg-orange-600 text-white",
            }
          : getStatusBadge(uiStatus);
        const showIcons = publicationsList.slice(0, MAX_PLATFORM_ICONS);
        const extraCount =
          publicationsList.length > MAX_PLATFORM_ICONS
            ? publicationsList.length - MAX_PLATFORM_ICONS
            : 0;
        const quickStatus: QuickActionStatus | null =
          uiStatus === "published" ||
          uiStatus === "failed" ||
          uiStatus === "scheduled" ||
          uiStatus === "draft"
            ? uiStatus
            : null;
        const composerSlug = toComposerSlug(displayType);

        return (
          <li
            key={post.id}
            className="relative rounded-[12px] border border-border bg-card transition-shadow hover:border-accent hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
          >
            {quickStatus && (
              <div className="absolute right-2 top-2 z-10">
                <QuickActionsMenu
                  postId={post.id}
                  status={quickStatus}
                  composerSlug={composerSlug}
                />
              </div>
            )}
            <Link
              href={`/dashboard/posts/${post.id}`}
              className="block p-4 pr-12 active:opacity-95 touch-manipulation"
            >
              {/* TOP ROW: [Post type badge] left, [Status badge] right */}
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {displayType}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-medium ${statusBadge.className}`}
                >
                  {statusBadge.prefix} {statusBadge.label}
                </span>
              </div>
              {/* MIDDLE: caption/title - larger, bolder, 2 lines */}
              <p
                className={`mb-2 line-clamp-2 text-[15px] leading-snug ${
                  hasCaption
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground italic"
                }`}
              >
                {preview}
              </p>
              {uiStatus === "failed" &&
                getFriendlyFailureReason(post.failureReason) && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1.5">
                    <AlertCircle
                      className="w-3.5 h-3.5 shrink-0"
                      strokeWidth={1.5}
                    />
                    {getFriendlyFailureReason(post.failureReason)}
                  </p>
                )}
              {/* BOTTOM ROW: [Platform icons left] [Date right muted] */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {showIcons.map((pub, i) => (
                    <PlatformIcon
                      key={`${post.id}-${i}-${pub.platform}`}
                      platform={pub.platform}
                      size={20}
                      className="text-muted-foreground"
                    />
                  ))}
                  {extraCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      +{extraCount} more
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {timestampLabel}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
