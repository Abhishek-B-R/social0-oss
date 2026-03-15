import type { ComponentType } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import NextImage from "next/image";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { PublishButton } from "../PublishButton";
import { PostAgainButton } from "../PostAgainButton";
import { PostCardDeleteButton } from "../PostCardDeleteButton";
import {
  getPostDetail,
  getPostMedia,
  hasPaymentFailedPosts,
  type PostDetailRow,
  type PostMediaRow,
} from "../posts-list-data";
import {
  Image as ImageIcon,
  Video,
  FileText,
  Layers,
  LayoutGrid,
  Play,
} from "lucide-react";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { formatDateTime } from "@/lib/date-format";
import { DOCS_POST_VIEW_URL } from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";

const TYPE_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  Thread: Layers,
  Image: ImageIcon,
  Video,
  Collection: LayoutGrid,
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Posted",
  partial: "Partial",
  failed: "Failed",
};

function getPublicationStatusBadge(status: string | null): {
  label: string;
  className: string;
} {
  switch (status) {
    case "published":
      return {
        label: "Posted",
        className:
          "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
      };
    case "partial":
      return {
        label: "Partial",
        className:
          "bg-purple-500/15 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/20 dark:border-purple-500/30",
      };
    case "publishing":
      return {
        label: "Publishing",
        className:
          "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
      };
    case "scheduled":
      return {
        label: "Scheduled",
        className:
          "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60",
      };
    case "failed":
      return {
        label: "Failed",
        className:
          "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60",
      };
    default:
      return {
        label: "Pending",
        className:
          "bg-gray-50 dark:bg-bg-muted text-gray-700 dark:text-text-muted border-gray-200 dark:border-border",
      };
  }
}

export type ThreadPartWithMedia = { text: string; mediaIds: string[] };

function getThreadParts(post: PostDetailRow): string[] {
  const withMedia = getThreadPartsWithMedia(post);
  return withMedia.map((p) => p.text);
}

function getThreadPartsWithMedia(post: PostDetailRow): ThreadPartWithMedia[] {
  const meta = post.metadata as
    | { twitterThread?: { parts?: { text?: string; mediaIds?: string[] }[] } }
    | undefined;
  const partsArr = meta?.twitterThread?.parts;
  if (Array.isArray(partsArr) && partsArr.length > 0) {
    return partsArr.map((p) => {
      const t =
        typeof p === "object" && p && "text" in p
          ? String((p as { text?: string }).text ?? "").trim()
          : "";
      const mediaIds = Array.isArray((p as { mediaIds?: string[] }).mediaIds)
        ? (p as { mediaIds: string[] }).mediaIds
        : [];
      return { text: t || "(No caption)", mediaIds };
    });
  }
  const raw = post.originalContent ?? "";
  const segments = raw
    .split(/\n\s*---\s*\n|\s+---\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length > 1) {
    return segments.map((text) => ({
      text: text || "(No caption)",
      mediaIds: [] as string[],
    }));
  }
  return [{ text: raw || "(No caption)", mediaIds: [] }];
}

function getDisplayType(
  post: PostDetailRow,
  partCount: number,
  media: PostMediaRow[],
): string {
  const meta = post.metadata as { contentType?: string } | undefined;
  const contentType = meta?.contentType;
  if (contentType === "threads") return "Thread";
  if (contentType === "collection") return "Collection";
  if (contentType === "image") return "Image";
  if (contentType === "video") return "Video";
  if (contentType === "text") return "Text";

  // Fallbacks for legacy posts with no contentType metadata.
  if (partCount > 1) return "Thread";
  if (media.length > 1) return "Collection";
  const hasVideo = media.some((m) => m.mimeType.startsWith("video/"));
  const hasImage = media.some((m) => m.mimeType.startsWith("image/"));
  if (hasVideo) return "Video";
  if (hasImage) return "Image";
  return "Text";
}

/** Map display type to new-post form slug (text, image, video, threads, collection) */
const DISPLAY_TYPE_TO_SLUG: Record<string, string> = {
  Text: "text",
  Image: "image",
  Video: "video",
  Thread: "threads",
  Collection: "collection",
};

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/dashboard/posts");

  const { use24HourTimeFormat, dateFormat, timezone } =
    await getUserSettingsSnapshot();

  const { id } = await params;
  const [data, showPaymentFailedBanner] = await Promise.all([
    getPostDetail(id, session.user.id),
    hasPaymentFailedPosts(session.user.id),
  ]);
  if (!data) redirect("/dashboard/posts");

  const { post, publications, queuedSlot } = data;

  if (post.status === "draft") {
    const media =
      post.mediaIds && post.mediaIds.length > 0
        ? await getPostMedia(session.user.id, post.mediaIds)
        : [];
    const parts = getThreadParts(post);
    const displayType = getDisplayType(post, parts.length, media);
    const slug = DISPLAY_TYPE_TO_SLUG[displayType] ?? "text";
    redirect(`/dashboard/create/${slug}?draft=${id}`);
  }

  const media =
    post.mediaIds && post.mediaIds.length > 0
      ? await getPostMedia(session.user.id, post.mediaIds)
      : [];

  const partsWithMedia = getThreadPartsWithMedia(post);
  const parts = partsWithMedia.map((p) => p.text);
  const isThread = partsWithMedia.length > 1;
  const displayType = getDisplayType(post, partsWithMedia.length, media);
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const TypeIcon = TYPE_ICON_MAP[displayType] ?? FileText;
  const slug = DISPLAY_TYPE_TO_SLUG[displayType] ?? "text";

  const publishedAts = publications
    .map((p) => p.publishedAt)
    .filter((d): d is Date => d != null);
  const publishedAt =
    publishedAts.length > 0
      ? new Date(Math.min(...publishedAts.map((d) => new Date(d).getTime())))
      : null;

  return (
    <div className="space-y-6">
      {showPaymentFailedBanner && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>Some posts failed to publish because your trial ended.</span>
          <Link
            href="/dashboard/billing"
            className="ml-auto font-medium underline underline-offset-2"
          >
            Upgrade now →
          </Link>
        </div>
      )}
      <div className="flex items-center gap-2 justify-between">
        <Link
          href="/dashboard/posts"
          className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to posts
        </Link>
        <DocsInfoIcon url={DOCS_POST_VIEW_URL} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* Left column: content + media */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-base font-semibold text-text">
                  Post content
                </h1>
                <p className="mt-1 text-xs text-text-muted">
                  Caption and body as it will appear when published.
                </p>
              </div>
            </div>

            {isThread ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text">
                    Thread ({partsWithMedia.length} parts)
                  </h2>
                </div>
                <div className="space-y-3">
                  {partsWithMedia.map((part, idx) => {
                    const partMedia = part.mediaIds
                      .map((mid) => mediaById.get(mid))
                      .filter((m): m is PostMediaRow => m != null);
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-border bg-bg-subtle p-4"
                      >
                        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                          Part {idx + 1}
                        </span>
                        <p className="mt-2 text-sm text-text whitespace-pre-wrap wrap-break-word">
                          {part.text || "(No caption)"}
                        </p>
                        {partMedia.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {partMedia.map((m) => {
                              const isVideo = m.mimeType.startsWith("video/");
                              return (
                                <div
                                  key={m.id}
                                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-bg-muted"
                                >
                                  {isVideo ? (
                                    <video
                                      src={m.url ?? undefined}
                                      className="h-full w-full object-cover"
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : (
                                    <NextImage
                                      src={m.thumbnailUrl ?? m.url ?? ""}
                                      alt={m.originalFilename}
                                      fill
                                      sizes="80px"
                                      className="object-cover"
                                      unoptimized
                                    />
                                  )}
                                  {isVideo && (
                                    <span
                                      className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg"
                                      aria-hidden
                                    >
                                      <Play
                                        className="h-8 w-8 text-white drop-shadow-sm fill-white"
                                        strokeWidth={2}
                                      />
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Caption
                </label>
                <div className="min-h-[120px] rounded-xl border border-border bg-bg-subtle px-3 py-3">
                  <p className="text-sm text-text whitespace-pre-wrap wrap-break-word">
                    {parts[0] ?? "(No caption)"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {media.length > 0 && (
            <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 space-y-4">
              <h2 className="text-base font-semibold text-text">Media</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-bg-muted"
                  >
                    {m.mimeType.startsWith("video/") ? (
                      <video
                        src={m.url ?? undefined}
                        className="w-full h-full object-cover"
                        controls
                        muted
                        playsInline
                      />
                    ) : (
                      <NextImage
                        src={m.thumbnailUrl ?? m.url ?? ""}
                        alt={m.originalFilename}
                        fill
                        sizes="(max-width: 768px) 33vw, 200px"
                        className="object-cover"
                        unoptimized
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: status, metadata, platforms, actions */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-3 py-1 text-xs font-medium text-text">
                  <TypeIcon className="h-4 w-4" />
                  {displayType}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                    post.status === "published"
                      ? "bg-emerald-600 text-white"
                      : post.status === "partial"
                        ? "bg-purple-500/20 text-purple-800 dark:text-purple-200 border border-purple-500/30"
                        : post.status === "publishing"
                          ? "bg-amber-500 text-white"
                          : post.status === "scheduled"
                            ? queuedSlot
                              ? "bg-orange-600 text-white"
                              : "bg-blue-600 text-white"
                            : post.status === "failed"
                              ? "bg-red-600 text-white"
                              : "bg-gray-500 text-gray-100"
                  }`}
                >
                  {post.status === "scheduled"
                    ? queuedSlot
                      ? "Queued"
                      : "Scheduled"
                    : (STATUS_LABEL[post.status ?? "draft"] ??
                      post.status ??
                      "Draft")}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {post.status === "scheduled" && (
                  <Link
                    href={`/dashboard/create/${slug}?scheduled=${post.id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle transition-colors"
                  >
                    Edit post
                  </Link>
                )}
                {(post.status === "draft" ||
                  post.status === "scheduled" ||
                  post.status === "failed" ||
                  post.status === "partial") && (
                  <PublishButton
                    postId={post.id}
                    label={
                      post.status === "failed" || post.status === "partial"
                        ? "Retry publish"
                        : "Publish now"
                    }
                  />
                )}
                {(post.status === "draft" || post.status === "scheduled") && (
                  <PostCardDeleteButton postId={post.id} status={post.status} />
                )}
                {(post.status === "published" || post.status === "partial") && (
                  <PostAgainButton postId={post.id} />
                )}
                {(post.status === "published" ||
                  post.status === "partial" ||
                  post.status === "failed") && (
                  <Link
                    href={`/dashboard/create/${slug}?edit=${post.id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle transition-colors"
                  >
                    Edit and post
                  </Link>
                )}
              </div>
            </div>

            <div className="text-xs text-text-muted space-y-1">
              {post.createdAt && (
                <p>
                  <span className="font-medium text-text">Created:</span>{" "}
                  {formatDateTime(new Date(post.createdAt), {
                    timezone,
                    dateFormat,
                    use24HourTimeFormat,
                  })}
                </p>
              )}
              {post.status === "scheduled" && post.scheduledAt && (
                <p>
                  <span className="font-medium text-text">Scheduled for:</span>{" "}
                  {formatDateTime(new Date(post.scheduledAt), {
                    timezone,
                    dateFormat,
                    use24HourTimeFormat,
                  })}
                </p>
              )}
              {publishedAt && (
                <p>
                  <span className="font-medium text-text">Posted:</span>{" "}
                  {formatDateTime(publishedAt, {
                    timezone,
                    dateFormat,
                    use24HourTimeFormat,
                  })}
                </p>
              )}
            </div>
            {post.status === "failed" && post.failureReason && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} />
                <span>{post.failureReason}</span>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-text">Platforms</h2>
            </div>
            {publications.length === 0 ? (
              <p className="text-xs text-text-muted">
                No platforms selected for this post.
              </p>
            ) : (
              <ul className="space-y-2">
                {publications.map((pub, i) => {
                  const badge = getPublicationStatusBadge(pub.status);
                  let viewUrl: string | null = null;
                  if (pub.platform === "instagram" && pub.platformUsername) {
                    viewUrl = `https://www.instagram.com/${pub.platformUsername}/`;
                  } else if (
                    pub.platform === "tiktok" &&
                    pub.status === "published" &&
                    pub.platformPostId &&
                    /^\d+$/.test(String(pub.platformPostId)) &&
                    pub.platformUsername
                  ) {
                    viewUrl = `https://www.tiktok.com/@${pub.platformUsername}/video/${pub.platformPostId}`;
                  } else {
                    viewUrl = pub.platformPostUrl ?? null;
                  }
                  return (
                    <li
                      key={`${pub.platform}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-subtle px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AccountAvatar
                          profileImageUrl={pub.profileImageUrl}
                          username={pub.platformUsername}
                          platform={pub.platform}
                          isTwitterPremium={pub.isTwitterPremium ?? false}
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-text capitalize">
                              {pub.platform.replace("_", " ")}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          {pub.platformUsername && (
                            <p className="text-xs text-text-muted truncate">
                              @{pub.platformUsername}
                            </p>
                          )}
                          {pub.lastError && pub.status === "failed" && (
                            <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400 line-clamp-2">
                              {pub.lastError}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {viewUrl && pub.status === "published" && (
                          <a
                            href={viewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                          >
                            View
                          </a>
                        )}
                        {pub.status === "failed" && (
                          <PublishButton postId={post.id} label="Retry" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
