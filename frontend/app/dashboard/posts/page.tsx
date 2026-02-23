import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { getPostsListData } from "./posts-list-data";
import { AllPostsFilters } from "./AllPostsFilters";
import { PostListCards } from "./PostListCards";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tiktok_published?: string;
    sort?: string;
    platform?: string;
    time?: string;
    account?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const {
    userPosts,
    publicationsByPostId,
    firstMediaByPost,
    platformOptions,
    accountOptions,
    resurfaceByPostId,
    autoPlugByPostId,
  } = await getPostsListData({
    userId: session.user.id,
    sort: params.sort === "oldest" ? "oldest" : "newest",
    platform: params.platform || null,
    time: params.time || null,
    account: params.account || null,
  });

  const hasActiveFilters = !!(params.platform || params.time || params.account);
  const showTikTokMessage = params?.tiktok_published === "true";

  return (
    <div>
      {showTikTokMessage && (
        <div className="mb-6 rounded-xl bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm text-blue-800 font-medium">
            ✅ Post published successfully! Your TikTok content may take a few minutes to process and appear on your profile.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            All Posts
            <span className="text-gray-400" title="All your posts with filters">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
            </span>
          </h2>
          <p className="text-gray-500 mt-1 font-medium">
            Your drafts, scheduled, and published posts
          </p>
        </div>
        <Link
          href="/dashboard/posts/new"
          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold shadow-lg transition-colors"
        >
          New post
        </Link>
      </div>

      <div className="mb-6">
        <Suspense fallback={<div className="h-10 w-48 rounded-lg bg-gray-100 animate-pulse" />}>
          <AllPostsFilters
            platformOptions={platformOptions}
            accountOptions={accountOptions}
          />
        </Suspense>
      </div>

      <PostListCards
        userPosts={userPosts}
        publicationsByPostId={publicationsByPostId}
        firstMediaByPost={firstMediaByPost}
        resurfaceByPostId={resurfaceByPostId}
        autoPlugByPostId={autoPlugByPostId}
        emptyMessage="You haven't created any posts yet."
        filterMessage="No posts match your filters."
        hasActiveFilters={hasActiveFilters}
      />
    </div>
  );
}
