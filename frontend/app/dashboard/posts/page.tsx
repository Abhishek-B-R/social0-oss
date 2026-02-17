import { auth } from "@/lib/auth";
import { db } from "@/db";
import { posts, postPublications, connectedAccounts } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { PublishButton } from "./PublishButton";

export default async function PostsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const userPosts = await db
    .select({
      id: posts.id,
      originalContent: posts.originalContent,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(eq(posts.userId, session.user.id))
    .orderBy(desc(posts.createdAt));

  const postIds = userPosts.map((p) => p.id);
  const publications =
    postIds.length > 0
      ? await db
          .select({
            postId: postPublications.postId,
            status: postPublications.status,
            platformPostUrl: postPublications.platformPostUrl,
            platform: connectedAccounts.platform,
            lastError: postPublications.lastError,
          })
          .from(postPublications)
          .innerJoin(
            connectedAccounts,
            eq(postPublications.connectedAccountId, connectedAccounts.id),
          )
          .where(inArray(postPublications.postId, postIds))
      : [];

  const publicationsByPostId = publications.reduce(
    (acc, p) => {
      if (!acc[p.postId]) acc[p.postId] = [];
      acc[p.postId].push(p);
      return acc;
    },
    {} as Record<
      string,
      {
        status: string | null;
        platformPostUrl: string | null;
        platform: string;
        lastError: string | null;
      }[]
    >,
  );

  const statusLabel: Record<string, string> = {
    draft: "Draft",
    scheduled: "Scheduled",
    publishing: "Publishing",
    published: "Published",
    failed: "Failed",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900">
            Posts
          </h2>
          <p className="text-gray-500 mt-1 font-medium">
            Your drafts and scheduled posts
          </p>
        </div>
        <Link
          href="/dashboard/posts/new"
          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold shadow-lg transition-colors"
        >
          New post
        </Link>
      </div>

      {userPosts.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-gray-600 mb-4 font-medium">
            You haven&apos;t created any posts yet.
          </p>
          <Link
            href="/dashboard/posts/new"
            className="inline-flex rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold shadow-lg transition-colors"
          >
            Create your first post
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {userPosts.map((post) => (
            <li
              key={post.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-gray-900 line-clamp-2 font-medium">
                    {post.originalContent}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                    <span
                      className={`inline-flex rounded-lg px-2.5 py-1 font-medium ${
                        post.status === "draft"
                          ? "bg-gray-100 text-gray-700"
                          : post.status === "published"
                            ? "bg-emerald-50 text-emerald-700"
                            : post.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {statusLabel[post.status ?? "draft"] ?? post.status ?? "draft"}
                    </span>
                    <span>
                      {post.createdAt
                        ? new Date(post.createdAt).toLocaleDateString(
                            undefined,
                            { dateStyle: "medium" }
                          )
                        : "—"}
                    </span>
                    {post.scheduledAt && (
                      <span>
                        Scheduled:{" "}
                        {new Date(
                          post.scheduledAt
                        ).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    )}
                    <span>
                      {publicationsByPostId[post.id]?.length ?? 0} platform
                      {(publicationsByPostId[post.id]?.length ?? 0) !== 1
                        ? "s"
                        : ""}
                    </span>
                    {post.status === "failed" &&
                      (() => {
                        const err = (publicationsByPostId[post.id] ?? []).find(
                          (p) => p.lastError,
                        )?.lastError;
                        return err ? (
                          <p className="mt-2 text-sm text-red-600 font-medium">
                            Why it failed: {err}
                          </p>
                        ) : null;
                      })()}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                      <span key={`${post.id}-${i}-${pub.platformPostUrl}`} className="inline-flex items-center gap-1.5">
                        <a
                          href={pub.platformPostUrl ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          View
                        </a>
                        {pub.platform === "medium" && (
                          <span className="text-xs text-gray-400 font-normal" title="Editing and deleting not supported">
                            (Publish only)
                          </span>
                        )}
                      </span>
                    ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
