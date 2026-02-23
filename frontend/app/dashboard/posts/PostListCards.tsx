import Link from "next/link";
import { PublishButton } from "./PublishButton";
import { AccountAvatar } from "@/components/AccountAvatar";
import { Image, Video, FileText } from "lucide-react";
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
};

export function PostListCards({
  userPosts,
  publicationsByPostId,
  firstMediaByPost,
  emptyMessage = "You haven't created any posts yet.",
  filterMessage = "No posts match your filters.",
  hasActiveFilters,
}: {
  userPosts: PostRow[];
  publicationsByPostId: Record<string, PublicationRow[]>;
  firstMediaByPost: Map<string, string>;
  emptyMessage?: string;
  filterMessage?: string;
  hasActiveFilters?: boolean;
}) {
  if (userPosts.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-gray-600 mb-4 font-medium">
          {hasActiveFilters ? filterMessage : emptyMessage}
        </p>
        <Link
          href="/dashboard/posts/new"
          className="inline-flex rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold shadow-lg transition-colors"
        >
          Create your first post
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {userPosts.map((post) => {
        const mime = firstMediaByPost.get(post.id) ?? "";
        const mediaType = mime.startsWith("video/")
          ? "video"
          : (post.mediaIds ?? []).length > 0
            ? "image"
            : "text";
        return (
          <li
            key={post.id}
            className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="p-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                {mediaType === "video" && <Video className="h-3.5 w-3.5" />}
                {mediaType === "image" && <Image className="h-3.5 w-3.5" />}
                {mediaType === "text" && <FileText className="h-3.5 w-3.5" />}
                <span className="capitalize">{mediaType}</span>
                <span>
                  {post.createdAt
                    ? new Date(post.createdAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                </span>
              </div>
              <p className="text-gray-900 line-clamp-2 font-medium text-sm">
                {post.originalContent || "(No caption)"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(publicationsByPostId[post.id] ?? []).map((pub, i) => (
                  <AccountAvatar
                    key={`${post.id}-${i}-${pub.platform}`}
                    profileImageUrl={pub.profileImageUrl}
                    username={pub.platformUsername}
                    platform={pub.platform}
                    size="sm"
                  />
                ))}
                <span
                  className={`ml-auto rounded-lg px-2 py-0.5 text-xs font-medium ${
                    post.status === "draft"
                      ? "bg-gray-100 text-gray-700"
                      : post.status === "published"
                        ? "bg-emerald-50 text-emerald-700"
                        : post.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {STATUS_LABEL[post.status ?? "draft"] ?? post.status ?? "draft"}
                </span>
              </div>
              {post.status === "failed" &&
                (() => {
                  const err = (publicationsByPostId[post.id] ?? []).find(
                    (p) => p.lastError
                  )?.lastError;
                  return err ? (
                    <p className="mt-2 text-xs text-red-600 line-clamp-1">
                      {err}
                    </p>
                  ) : null;
                })()}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-4 py-3 bg-gray-50/50">
              {(post.status === "draft" ||
                post.status === "scheduled" ||
                post.status === "failed") && (
                <PublishButton
                  postId={post.id}
                  label={
                    post.status === "failed" ? "Retry publish" : "Publish now"
                  }
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
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    View
                  </a>
                ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
