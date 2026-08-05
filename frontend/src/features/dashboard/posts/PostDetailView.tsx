
import { useNavigate, useLocation } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "@/components/AppLink";
import AppImage from "@/components/AppImage";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { PublishButton } from "./PublishButton";
import { PostAgainButton } from "./PostAgainButton";
import { PostCardDeleteButton } from "./PostCardDeleteButton";
import {
  Image as ImageIcon,
  Video,
  FileText,
  Layers,
  LayoutGrid,
} from "lucide-react";
import { PostDetailAutoFeaturesSection } from "./PostDetailAutoFeaturesSection";
import { formatDateTime } from "@/lib/date-format";
import { sortBySlowPlatformsLast } from "@/lib/publish-order";
import { getPublicationViewUrl } from "@/lib/platform-view-url";
import {
  enrichTwitterErrorForDisplay,
  isTwitterPlatformId,
} from "@/lib/twitter-errors";
import { DOCS_POST_VIEW_URL } from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";
import {
  resolvePostDetailBack,
  type PostDetailLocationState,
} from "@/lib/post-detail-back";
import {
  loadPostDetailCoreData,
  loadPostDetailMediaData,
} from "@/api/dashboard-data";
import { PostDetailPageSkeleton } from "@/components/ui/page-skeletons";
import { PublishStatusSection } from "./PublishStatusSection";

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
          "bg-accent/10 dark:bg-accent/15 text-accent dark:text-accent-light border-accent/25 dark:border-accent/35",
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

type PostMediaRow = Extract<
  Awaited<ReturnType<typeof loadPostDetailMediaData>>,
  { ok: true }
>["data"]["media"][number];

type CoreData = Extract<
  Awaited<ReturnType<typeof loadPostDetailCoreData>>,
  { ok: true }
>["data"];

type ThreadPartWithMedia = { text: string; mediaIds: string[] };

function getThreadPartsWithMedia(post: CoreData["post"]): ThreadPartWithMedia[] {
  const meta = post.metadata as
    | { twitterThread?: { parts?: { text?: string; mediaIds?: string[] }[] } }
    | undefined;
  const partsArr = meta?.twitterThread?.parts;
  if (Array.isArray(partsArr) && partsArr.length > 0) {
    return partsArr.map((p) => {
      const text = String(p?.text ?? "").trim();
      return {
        text: text || "(No caption)",
        mediaIds: Array.isArray(p?.mediaIds) ? p.mediaIds : [],
      };
    });
  }
  const raw = post.originalContent ?? "";
  const segments = raw
    .split(/\n\s*---\s*\n|\s+---\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length > 1) {
    return segments.map((text) => ({ text, mediaIds: [] }));
  }
  return [{ text: raw || "(No caption)", mediaIds: [] }];
}

function getDisplayType(
  post: CoreData["post"],
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
  if (partCount > 1) return "Thread";
  if (media.length > 1) return "Collection";
  const hasVideo = media.some((m) => m.mimeType.startsWith("video/"));
  const hasImage = media.some((m) => m.mimeType.startsWith("image/"));
  if (hasVideo) return "Video";
  if (hasImage) return "Image";
  return "Text";
}

const DISPLAY_TYPE_TO_SLUG: Record<string, string> = {
  Text: "text",
  Image: "image",
  Video: "video",
  Thread: "threads",
  Collection: "collection",
};

export function PostDetailView({ postId }: { postId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const back = resolvePostDetailBack(
    (location.state as PostDetailLocationState | null)?.from,
  );
  const invalidateQueries = useInvalidateQueries();
  const [core, setCore] = useState<CoreData | null>(null);
  const [coreLoading, setCoreLoading] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [media, setMedia] = useState<PostMediaRow[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadPostDetailCoreData(postId);
      if (cancelled) return;
      if (!result.ok) {
        if (result.error === "Unauthorized") {
          navigate("/");
          return;
        }
        if (result.error === "NotFound") {
          navigate("/dashboard/posts", { replace: true });
          return;
        }
        setCoreError(result.error);
        setCoreLoading(false);
        return;
      }
      setCore(result.data);
      setCoreLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, navigate, invalidateQueries]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadPostDetailMediaData(postId);
      if (cancelled) return;
      if (!result.ok) {
        if (result.error === "Unauthorized") {
          navigate("/");
          return;
        }
        setMediaError(result.error);
        setMediaLoading(false);
        return;
      }
      setMedia(result.data.media);
      setMediaLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, navigate, invalidateQueries]);

  const partsWithMedia = useMemo(
    () => (core ? getThreadPartsWithMedia(core.post) : []),
    [core],
  );
  const displayType = useMemo(
    () => (core ? getDisplayType(core.post, partsWithMedia.length, media) : "Text"),
    [core, media, partsWithMedia.length],
  );
  const slug = DISPLAY_TYPE_TO_SLUG[displayType] ?? "text";

  useEffect(() => {
    if (!core) return;
    if (core.post.status !== "draft") return;
    if (mediaLoading) return;
    navigate(`/dashboard/create/${slug}?draft=${postId}`, { replace: true });
  }, [core, mediaLoading, postId, navigate, slug]);

  if (coreLoading) {
    return <PostDetailPageSkeleton />;
  }
  if (coreError || !core) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {coreError ?? "Could not load post details."}
      </div>
    );
  }

  const post = core.post;
  const publications = core.publications.map((p) => ({
    ...p,
    publishedAt: p.publishedAt ? new Date(p.publishedAt) : null,
  }));
  const publicationsSorted = sortBySlowPlatformsLast(publications);
  const queuedSlot = core.queuedSlot
    ? { ...core.queuedSlot, scheduledFor: new Date(core.queuedSlot.scheduledFor) }
    : null;
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const TypeIcon = TYPE_ICON_MAP[displayType] ?? FileText;

  const publishedAts = publications
    .map((p) => p.publishedAt)
    .filter((d): d is Date => d != null);
  const publishedAt =
    publishedAts.length > 0
      ? new Date(Math.min(...publishedAts.map((d) => d.getTime())))
      : null;
  const xPublishedAts = publications
    .filter((p) => p.platform === "twitter_x" && p.status === "published")
    .map((p) => p.publishedAt)
    .filter((d): d is Date => d != null);
  const publishedAtForXAutoFeatures =
    xPublishedAts.length > 0
      ? new Date(Math.min(...xPublishedAts.map((d) => d.getTime())))
      : null;
  const hasXPublished = publicationsSorted.some(
    (p) => p.platform === "twitter_x" && p.status === "published",
  );
  const xPublishedAccountIds = publicationsSorted
    .filter((p) => p.platform === "twitter_x" && p.status === "published")
    .map((p) => p.connectedAccountId)
    .filter((cid): cid is string => !!cid);
  const hasXSelected = publicationsSorted.some((p) => p.platform === "twitter_x");
  const xSelectedAccountIds = [
    ...new Set(
      publicationsSorted
        .filter((p) => p.platform === "twitter_x")
        .map((p) => p.connectedAccountId)
        .filter((cid): cid is string => !!cid),
    ),
  ];

  const bulkMeta = post.metadata as
    | {
        bulkAutoFeatures?: {
          autoRepostConfig?: {
            intervalHours: number;
            maxResurfaces: number;
            plugComment?: string;
          };
          autoPlugConfig?: {
            metricType: string;
            threshold: number;
            plugComment: string;
          };
        };
      }
    | null
    | undefined;
  const bulk = bulkMeta?.bulkAutoFeatures;
  const pendingAutoPlugFromBulk = bulk?.autoPlugConfig
    ? {
        metricType:
          bulk.autoPlugConfig.metricType === "retweets"
            ? ("retweets" as const)
            : ("likes" as const),
        threshold: bulk.autoPlugConfig.threshold,
        plugComment: bulk.autoPlugConfig.plugComment,
      }
    : null;
  const pendingResurfaceFromBulk = bulk?.autoRepostConfig
    ? {
        intervalHours: bulk.autoRepostConfig.intervalHours,
        maxResurfaces: bulk.autoRepostConfig.maxResurfaces,
        plugComment: bulk.autoRepostConfig.plugComment ?? "",
      }
    : null;

  return (
    <div className="space-y-6">
      {core.showPaymentFailedBanner && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>Some posts failed to publish because your plan is inactive.</span>
          <Link
            href="/dashboard/billing"
            className="ml-auto font-medium underline underline-offset-2"
          >
            Upgrade now →
          </Link>
        </div>
      )}

      <div className="flex items-center gap-2 justify-between">
        <button
          type="button"
          onClick={() => {
            const from = (location.state as PostDetailLocationState | null)
              ?.from;
            const resolved = resolvePostDetailBack(from);
            if (
              typeof from === "string" &&
              resolved.href === from
            ) {
              navigate(from);
              return;
            }
            // Preserve calendar → post → back without a hardcoded posts list.
            navigate(-1);
          }}
          className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {back.label}
        </button>
        <DocsInfoIcon url={DOCS_POST_VIEW_URL} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 space-y-4">
            <h1 className="text-base font-semibold text-text">Post content</h1>
            {partsWithMedia.length > 1 ? (
              <div className="space-y-3">
                {partsWithMedia.map((part, idx) => {
                  const partMedia = part.mediaIds
                    .map((mid) => mediaById.get(mid))
                    .filter((m): m is PostMediaRow => m != null);
                  return (
                    <div key={idx} className="rounded-lg bg-neutral-100 dark:bg-neutral-900 p-4">
                      <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                        Part {idx + 1}
                      </span>
                      <p className="mt-2 text-sm text-text whitespace-pre-wrap wrap-break-word">
                        {part.text}
                      </p>
                      {part.mediaIds.length > 0 && mediaLoading && (
                        <p className="mt-2 text-xs text-text-muted">Loading media...</p>
                      )}
                      {partMedia.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {partMedia.map((m) => (
                            <div
                              key={m.id}
                              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-bg-muted"
                            >
                              {m.mimeType.startsWith("video/") ? (
                                <video
                                  src={m.url ?? undefined}
                                  className="h-full w-full object-cover"
                                  muted
                                  playsInline
                                  preload="metadata"
                                />
                              ) : (
                                <AppImage
                                  src={m.thumbnailUrl ?? m.url ?? ""}
                                  alt={m.originalFilename}
                                  fill
                                  sizes="80px"
                                  className="object-cover"
                                  unoptimized
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg bg-neutral-100 dark:bg-neutral-900 p-4 min-h-[80px]">
                <p className="text-sm text-text whitespace-pre-wrap wrap-break-word">
                  {partsWithMedia[0]?.text ?? "(No caption)"}
                </p>
              </div>
            )}
          </div>

          {mediaLoading && (
            <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 text-sm text-text-muted">
              Loading media...
            </div>
          )}
          {mediaError && (
            <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 text-sm text-red-500">
              Could not load media.
            </div>
          )}
          {media.length > 0 && (
            <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 space-y-4">
              <h2 className="text-base font-semibold text-text">Media</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className="relative aspect-square max-h-[200px] rounded-lg overflow-hidden bg-bg-muted"
                  >
                    {m.mimeType.startsWith("video/") ? (
                      <video
                        src={m.url ?? undefined}
                        className="w-full h-full object-cover"
                        controls
                        muted
                        playsInline
                        preload="metadata"
                        poster={m.thumbnailUrl ?? undefined}
                      />
                    ) : (
                      <AppImage
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
                      ? "bg-accent text-accent-foreground"
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
                    : (STATUS_LABEL[post.status ?? "draft"] ?? "Draft")}
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
                    timezone: core.timezone,
                    dateFormat: core.dateFormat,
                    use24HourTimeFormat: core.use24HourTimeFormat,
                  })}
                </p>
              )}
              {queuedSlot?.scheduledFor && (
                <p>
                  <span className="font-medium text-text">Queued for:</span>{" "}
                  {formatDateTime(new Date(queuedSlot.scheduledFor), {
                    timezone: core.timezone,
                    dateFormat: core.dateFormat,
                    use24HourTimeFormat: core.use24HourTimeFormat,
                  })}
                </p>
              )}
              {!queuedSlot && post.scheduledAt && (
                <p>
                  <span className="font-medium text-text">Scheduled for:</span>{" "}
                  {formatDateTime(new Date(post.scheduledAt), {
                    timezone: core.timezone,
                    dateFormat: core.dateFormat,
                    use24HourTimeFormat: core.use24HourTimeFormat,
                  })}
                </p>
              )}
              {publishedAt && (
                <p>
                  <span className="font-medium text-text">Posted:</span>{" "}
                  {formatDateTime(publishedAt, {
                    timezone: core.timezone,
                    dateFormat: core.dateFormat,
                    use24HourTimeFormat: core.use24HourTimeFormat,
                  })}
                </p>
              )}
            </div>
            {post.status === "failed" && post.failureReason && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{post.failureReason}</span>
              </div>
            )}
          </div>

          <PublishStatusSection
            postStatus={post.status}
            isQueued={Boolean(queuedSlot)}
            publications={publicationsSorted}
            events={core.publishTimeline ?? []}
            timezone={core.timezone}
            dateFormat={core.dateFormat}
            use24HourTimeFormat={core.use24HourTimeFormat}
            formatDateTime={formatDateTime}
          />

          <div className="rounded-2xl border border-border bg-bg-elevated shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-text">Platforms</h2>
            {publicationsSorted.length === 0 ? (
              <p className="text-xs text-text-muted">No platforms selected.</p>
            ) : (
              <ul className="space-y-2">
                {publicationsSorted.map((pub) => {
                  const badge = getPublicationStatusBadge(pub.status);
                  const viewUrl = getPublicationViewUrl(pub);
                  return (
                    <li
                      key={pub.connectedAccountId ?? pub.platform}
                      className="rounded-xl border border-border bg-bg-subtle px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <AccountAvatar
                            accountId={pub.connectedAccountId ?? undefined}
                            profileImageUrl={pub.profileImageUrl}
                            username={pub.platformUsername}
                            platform={pub.platform}
                            isTwitterPremium={pub.isTwitterPremium ?? false}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
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
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pt-0.5">
                          {viewUrl && pub.status === "published" && (
                            <a
                              href={viewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                            >
                              View
                            </a>
                          )}
                          {pub.status === "failed" && (
                            <PublishButton
                              postId={post.id}
                              publicationId={pub.publicationId}
                              label="Retry"
                            />
                          )}
                        </div>
                      </div>
                      {pub.lastError && pub.status === "failed" && (
                        <p className="mt-2 text-xs leading-relaxed text-red-600 dark:text-red-400 break-words whitespace-pre-wrap">
                          {isTwitterPlatformId(pub.platform)
                            ? enrichTwitterErrorForDisplay(pub.lastError)
                            : pub.lastError}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {((hasXPublished &&
            (post.status === "published" || post.status === "partial")) ||
            (post.status === "scheduled" && hasXSelected)) && (
            <PostDetailAutoFeaturesSection
              postId={post.id}
              publishedAt={
                post.status === "scheduled" ? null : publishedAtForXAutoFeatures
              }
              variant={post.status === "scheduled" ? "scheduled" : "published"}
              pendingAutoPlugFromServer={
                post.status === "scheduled" ? pendingAutoPlugFromBulk : null
              }
              pendingResurfaceFromServer={
                post.status === "scheduled" ? pendingResurfaceFromBulk : null
              }
              use24HourTimeFormat={core.use24HourTimeFormat}
              allowAutoPlug={core.allowAutoPlug}
              allowResurface={core.allowResurface}
              autoPlugDetail={core.autoPlug}
              resurfaceDetail={core.resurface}
              selectedAccountIds={
                post.status === "scheduled"
                  ? xSelectedAccountIds
                  : xPublishedAccountIds
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
