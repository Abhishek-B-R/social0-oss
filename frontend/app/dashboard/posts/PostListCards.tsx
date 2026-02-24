"use client";

import Link from "next/link";
import { PublishButton } from "./PublishButton";
import { PostCardDeleteButton } from "./PostCardDeleteButton";
import { PlatformIcon } from "./PlatformIcon";
import { AddResurfaceCardButton } from "@/components/repost/AddResurfaceCardButton";
import { AddAutoPlugCardButton } from "@/components/autoplug/AddAutoPlugCardButton";
import {
  RESURFACE_PLATFORMS,
  isWithinResurfaceWindow,
  isWithinAutoPlugWindow,
} from "@/lib/resurface-utils";
import type { PublicationRow } from "./posts-list-data";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Posted",
  failed: "Failed",
};

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

function getTimestampLabel(
  post: PostRow,
  publications: { publishedAt: Date | null }[],
): string {
  const dateOpts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };
  if (post.status === "scheduled" && post.scheduledAt) {
    return `Scheduled for ${new Date(post.scheduledAt).toLocaleString(undefined, dateOpts)}`;
  }
  if (post.status === "published") {
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
    case "publishing":
      return { label: "Publishing", prefix: "◌", className: "bg-amber-400 text-amber-950" };
    case "scheduled":
      return { label: "Scheduled", prefix: "◷", className: "bg-blue-600 text-white" };
    case "failed":
      return { label: "Failed", prefix: "✕", className: "bg-red-600 text-white" };
    default:
      return { label: "Draft", prefix: "○", className: "bg-gray-200 text-gray-700" };
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
}: {
  userPosts: PostRow[];
  publicationsByPostId: Record<string, PublicationRow[]>;
  firstMediaByPost: Map<string, string>;
  resurfaceByPostId?: Record<string, ResurfaceForPost>;
  autoPlugByPostId?: Record<string, AutoPlugForPost>;
  emptyMessage?: string;
  filterMessage?: string;
  hasActiveFilters?: boolean;
}) {
  if (userPosts.length === 0) {
    return (
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-10 text-center">
        <p className="mb-4 font-medium text-gray-600">
          {hasActiveFilters ? filterMessage : emptyMessage}
        </p>
        <Link
          href="/dashboard/posts/new"
          className="inline-flex rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-emerald-700"
        >
          Create your first post
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {userPosts.map((post) => {
        const mime = firstMediaByPost.get(post.id) ?? "";
        const { parts } = getThreadPreview(post);
        const partCount = parts.length;
        const mediaIds = post.mediaIds ?? [];
        const displayType = getDisplayType(post, partCount, mime, mediaIds);
        const timestampLabel = getTimestampLabel(post, publicationsByPostId[post.id] ?? []);

        const PREVIEW_LEN = 120;
        const firstPart = parts[0] ?? "";
        const preview =
          firstPart.length > PREVIEW_LEN
            ? `${firstPart.slice(0, PREVIEW_LEN)}…`
            : firstPart || "(No caption)";

        const publicationsList = publicationsByPostId[post.id] ?? [];
        const statusBadge = getStatusBadge(post.status);
        const showIcons = publicationsList.slice(0, MAX_PLATFORM_ICONS);
        const extraCount = publicationsList.length > MAX_PLATFORM_ICONS ? publicationsList.length - MAX_PLATFORM_ICONS : 0;

        const isFailed = post.status === "failed";
        const isPublishing = post.status === "publishing";
        const cardBorderClass = isFailed
          ? "border-l-4 border-l-red-500 border border-[#e5e7eb]"
          : isPublishing
            ? "border-l-4 border-l-amber-400 border border-[#e5e7eb]"
            : "border border-[#e5e7eb]";

        return (
          <li
            key={post.id}
            className={`rounded-[12px] bg-white transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${cardBorderClass}`}
          >
            <Link
              href={`/dashboard/posts/${post.id}`}
              className="block p-4"
            >
              {/* TOP ROW: [Post type badge] left, [Status badge] right */}
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                  {displayType}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}
                >
                  {statusBadge.prefix} {statusBadge.label}
                </span>
              </div>
              {/* MIDDLE: caption/title — larger, bolder, 2 lines */}
              <p className="mb-2 line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900">
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
                      className="text-gray-500"
                    />
                  ))}
                  {extraCount > 0 && (
                    <span className="text-xs text-gray-400">+{extraCount} more</span>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {timestampLabel}
                </span>
              </div>
            </Link>
            {/* Footer: actions — same logic, improved styling */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-4 py-2.5 bg-gray-50/50">
              {post.status === "draft" && (
                <Link
                  href={`/dashboard/posts/${post.id}/edit`}
                  className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Edit
                </Link>
              )}
              {(post.status === "draft" || post.status === "scheduled") && (
                <PostCardDeleteButton postId={post.id} status={post.status} />
              )}
              {(post.status === "draft" ||
                post.status === "scheduled" ||
                post.status === "failed") && (
                <PublishButton
                  postId={post.id}
                  label={post.status === "failed" ? "Retry publish" : "Publish now"}
                />
              )}
              {(publicationsByPostId[post.id] ?? [])
                .filter((p) => p.platformPostUrl)
                .map((pub, i) => (
                  <a
                    key={`${post.id}-${i}-${pub.platformPostUrl}`}
                    href={pub.platformPostUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    View
                  </a>
                ))}
              {post.status === "published" &&
                !resurfaceByPostId[post.id] &&
                (() => {
                  const pubs = publicationsByPostId[post.id] ?? [];
                  const supported = pubs.filter((p) =>
                    RESURFACE_PLATFORMS.includes(
                      p.platform as (typeof RESURFACE_PLATFORMS)[number],
                    ),
                  );
                  const publishedAts = supported
                    .map((p) => p.publishedAt)
                    .filter((d): d is Date => d != null);
                  const earliest =
                    publishedAts.length > 0
                      ? new Date(
                          Math.min(...publishedAts.map((d) => new Date(d).getTime())),
                        )
                      : null;
                  return (
                    supported.length > 0 &&
                    earliest &&
                    isWithinResurfaceWindow(earliest) && (
                      <AddResurfaceCardButton
                        postId={post.id}
                        publishedAt={earliest}
                        publications={pubs.map((p) => ({
                          connectedAccountId: p.connectedAccountId,
                          platform: p.platform,
                        }))}
                      />
                    )
                  );
                })()}
              {post.status === "published" &&
                (() => {
                  const pubs = publicationsByPostId[post.id] ?? [];
                  const xPubs = pubs.filter((p) => p.platform === "twitter_x");
                  const publishedAts = xPubs
                    .map((p) => p.publishedAt)
                    .filter((d): d is Date => d != null);
                  const earliest =
                    publishedAts.length > 0
                      ? new Date(
                          Math.min(...publishedAts.map((d) => new Date(d).getTime())),
                        )
                      : null;
                  const plug = autoPlugByPostId[post.id];
                  const canAddPlug =
                    xPubs.length > 0 &&
                    earliest &&
                    isWithinAutoPlugWindow(earliest) &&
                    plug?.status !== "watching" &&
                    plug?.status !== "triggered";
                  return (
                    canAddPlug && (
                      <AddAutoPlugCardButton
                        postId={post.id}
                        publishedAt={earliest!}
                        publications={pubs.map((p) => ({
                          connectedAccountId: p.connectedAccountId,
                          platform: p.platform,
                          profileImageUrl: p.profileImageUrl,
                          platformUsername: p.platformUsername,
                        }))}
                      />
                    )
                  );
                })()}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
