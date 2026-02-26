"use client";

import Link from "next/link";
import { PlatformIcon } from "./PlatformIcon";
import type { PublicationRow } from "./posts-list-data";

type PostRow = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: Date | null;
  createdAt: Date | null;
  mediaIds: string[] | null;
  metadata?: Record<string, unknown> | null;
};

type ThreadPreview = {
  parts: string[];
  isThread: boolean;
};

function getThreadPreview(post: PostRow): ThreadPreview {
  const meta = post.metadata as { twitterThread?: { parts?: { text: string }[] } } | undefined;
  const partsArr = meta?.twitterThread?.parts;
  if (Array.isArray(partsArr) && partsArr.length > 0) {
    const parts = partsArr.map((p) => {
      const t = typeof p === "object" && p && "text" in p ? String((p as { text: string }).text).trim() : "";
      return t || "(No caption)";
    });
    return { parts, isThread: true };
  }
  const raw = post.originalContent ?? "";
  const segments = raw.split(/\n\s*---\s*\n|\s+---\s+/).map((s) => s.trim()).filter(Boolean);
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
): string {
  if (partCount > 1) return "Thread";
  if (firstMime.startsWith("video/")) return "Video";
  if (mediaIds.length >= 1 && firstMime.startsWith("image/")) return "Image";
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
  use24HourTimeFormat: boolean,
): string {
  const effectiveStatus = getUiStatus(post);
  const dateOpts: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
    timeStyle: "short",
    hour12: !use24HourTimeFormat,
  };
  if (effectiveStatus === "scheduled" && post.scheduledAt) {
    return `Scheduled for ${new Date(post.scheduledAt).toLocaleString(undefined, dateOpts)}`;
  }
  if (effectiveStatus === "published") {
    const publishedAts = publications
      .map((p) => p.publishedAt)
      .filter((d): d is Date => d != null);
    const publishedAt =
      publishedAts.length > 0
        ? new Date(Math.min(...publishedAts.map((d) => new Date(d).getTime())))
        : null;
    return publishedAt
      ? `Posted at ${publishedAt.toLocaleString(undefined, dateOpts)}`
      : "Posted";
  }
  return post.createdAt
    ? `Created ${new Date(post.createdAt).toLocaleString(undefined, dateOpts)}`
    : "—";
}

/** Status pill: label + optional prefix character. */
function getStatusBadge(status: string | null): { label: string; className: string; prefix: string } {
  switch (status) {
    case "published":
      return { label: "Posted", prefix: "●", className: "bg-emerald-600 text-white" };
    case "partial":
      return { label: "Partial", prefix: "◐", className: "bg-violet-600 text-white" };
    case "publishing":
      return { label: "Publishing", prefix: "◌", className: "bg-amber-400 text-amber-950" };
    case "scheduled":
      return { label: "Scheduled", prefix: "◷", className: "bg-blue-600 text-white" };
    case "failed":
      return { label: "Failed", prefix: "✕", className: "bg-red-600 text-white" };
    default:
      return { label: "Draft", prefix: "○", className: "bg-muted text-foreground" };
  }
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
  autoPlugByPostId = {},
  emptyMessage = "You haven't created any posts yet.",
  filterMessage = "No posts match your filters.",
  hasActiveFilters,
  use24HourTimeFormat = false,
}: {
  userPosts: PostRow[];
  publicationsByPostId: Record<string, PublicationRow[]>;
  firstMediaByPost: Map<string, { mimeType: string; originalFilename: string | null }>;
  resurfaceByPostId?: Record<string, ResurfaceForPost>;
  autoPlugByPostId?: Record<string, AutoPlugForPost>;
  emptyMessage?: string;
  filterMessage?: string;
  hasActiveFilters?: boolean;
   use24HourTimeFormat?: boolean;
}) {
  if (userPosts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <p className="mb-4 font-medium text-muted-foreground">
          {hasActiveFilters ? filterMessage : emptyMessage}
        </p>
        <Link
          href="/dashboard/posts/new"
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
        const { parts } = getThreadPreview(post);
        const partCount = parts.length;
        const mediaIds = post.mediaIds ?? [];
        const displayType = getDisplayType(post, partCount, mime, mediaIds);
        const uiStatus = getUiStatus(post);
        const timestampLabel = getTimestampLabel(
          post,
          publicationsByPostId[post.id] ?? [],
          use24HourTimeFormat,
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
        const statusBadge = getStatusBadge(uiStatus);
        const showIcons = publicationsList.slice(0, MAX_PLATFORM_ICONS);
        const extraCount = publicationsList.length > MAX_PLATFORM_ICONS ? publicationsList.length - MAX_PLATFORM_ICONS : 0;

        const isPublishing = uiStatus === "publishing";
        const cardBorderClass = isPublishing
          ? "border-l-4 border-l-amber-400 border border-border"
          : "border border-border";

        return (
          <li
            key={post.id}
            className={`rounded-[12px] bg-card transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${cardBorderClass}`}
          >
            <Link
              href={`/dashboard/posts/${post.id}`}
              className="block p-4"
            >
              {/* TOP ROW: [Post type badge] left, [Status badge] right */}
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {displayType}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}
                >
                  {statusBadge.prefix} {statusBadge.label}
                </span>
              </div>
              {/* MIDDLE: caption/title — larger, bolder, 2 lines */}
              <p
                className={`mb-2 line-clamp-2 text-[15px] leading-snug ${
                  hasCaption
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground italic"
                }`}
              >
                {preview}
              </p>
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
