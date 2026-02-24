import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import {
  getPostDetail,
  getPostMedia,
  type PostDetailRow,
  type PostMediaRow,
} from "../posts-list-data";
import { Image, Video, FileText, Layers, BookOpen, LayoutGrid } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Posted",
  failed: "Failed",
};

function getThreadParts(post: PostDetailRow): string[] {
  const meta = post.metadata as { twitterThread?: { parts?: { text: string }[] } } | undefined;
  const partsArr = meta?.twitterThread?.parts;
  if (Array.isArray(partsArr) && partsArr.length > 0) {
    return partsArr.map((p) => {
      const t =
        typeof p === "object" && p && "text" in p
          ? String((p as { text: string }).text).trim()
          : "";
      return t || "(No caption)";
    });
  }
  const raw = post.originalContent ?? "";
  const segments = raw
    .split(/\n\s*---\s*\n|\s+---\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.length > 1 ? segments : [raw || "(No caption)"];
}

function getDisplayType(
  post: PostDetailRow,
  partCount: number,
  media: PostMediaRow[],
): string {
  if (partCount > 1) return "Thread";
  const meta = post.metadata as { contentType?: string } | undefined;
  if (meta?.contentType === "blog") return "Blog";
  if (media.length > 1) return "Collection";
  const hasVideo = media.some((m) => m.mimeType.startsWith("video/"));
  const hasImage = media.some((m) => m.mimeType.startsWith("image/"));
  if (hasVideo) return "Video";
  if (hasImage) return "Image";
  return "Text";
}

function getTypeIcon(type: string) {
  switch (type) {
    case "Thread":
      return Layers;
    case "Image":
      return Image;
    case "Video":
      return Video;
    case "Blog":
      return BookOpen;
    case "Collection":
      return LayoutGrid;
    default:
      return FileText;
  }
}

const dateOpts: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/dashboard/posts");

  const { id } = await params;
  const data = await getPostDetail(id, session.user.id);
  if (!data) redirect("/dashboard/posts");

  const { post, publications } = data;
  const media =
    post.mediaIds && post.mediaIds.length > 0
      ? await getPostMedia(session.user.id, post.mediaIds)
      : [];

  const parts = getThreadParts(post);
  const isThread = parts.length > 1;
  const displayType = getDisplayType(post, parts.length, media);
  const TypeIcon = getTypeIcon(displayType);

  const publishedAts = publications
    .map((p) => p.publishedAt)
    .filter((d): d is Date => d != null);
  const publishedAt =
    publishedAts.length > 0
      ? new Date(Math.min(...publishedAts.map((d) => new Date(d).getTime())))
      : null;

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/dashboard/posts"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to posts
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
              <TypeIcon className="h-4 w-4" />
              {displayType}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                post.status === "published"
                  ? "bg-emerald-600 text-white"
                  : post.status === "publishing"
                    ? "bg-amber-500 text-white"
                    : post.status === "scheduled"
                      ? "bg-blue-600 text-white"
                      : post.status === "failed"
                        ? "bg-red-600 text-white"
                        : "bg-gray-500 text-gray-100"
              }`}
            >
              {STATUS_LABEL[post.status ?? "draft"] ?? post.status ?? "Draft"}
            </span>
          </div>

          <div className="text-sm text-gray-500 space-y-1">
            {post.createdAt && (
              <p>
                Created{" "}
                {new Date(post.createdAt).toLocaleString(undefined, dateOpts)}
              </p>
            )}
            {post.status === "scheduled" && post.scheduledAt && (
              <p>
                Scheduled for{" "}
                {new Date(post.scheduledAt).toLocaleString(undefined, dateOpts)}
              </p>
            )}
            {publishedAt && (
              <p>Posted {publishedAt.toLocaleString(undefined, dateOpts)}</p>
            )}
          </div>

          {isThread ? (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900">
                Thread ({parts.length} parts)
              </h2>
              <div className="space-y-3">
                {parts.map((text, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-gray-200 bg-gray-50/50 p-4"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Part {idx + 1}
                    </span>
                    <p className="mt-2 text-gray-900 whitespace-pre-wrap break-words">
                      {text || "(No caption)"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
              <p className="text-gray-900 whitespace-pre-wrap break-words">
                {parts[0] ?? "(No caption)"}
              </p>
            </div>
          )}

          {media.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-2">
                Media
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100"
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
                      <img
                        src={m.thumbnailUrl ?? m.url ?? ""}
                        alt={m.originalFilename}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Platforms
            </h2>
            <ul className="space-y-2">
              {publications.map((pub, i) => (
                <li
                  key={`${pub.platform}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AccountAvatar
                      profileImageUrl={pub.profileImageUrl}
                      username={pub.platformUsername}
                      platform={pub.platform}
                      size="md"
                    />
                    <span className="font-medium text-gray-900 capitalize">
                      {pub.platform.replace("_", " ")}
                    </span>
                    {pub.status === "published" && (
                      <span className="text-xs text-emerald-600 font-medium">
                        Posted
                      </span>
                    )}
                  </div>
                  {pub.platformPostUrl && (
                    <a
                      href={pub.platformPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      View
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
