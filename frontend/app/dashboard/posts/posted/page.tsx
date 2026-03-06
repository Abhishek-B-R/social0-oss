import { auth } from "@/lib/auth";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { getPostsListData, POSTS_PAGE_SIZE } from "../posts-list-data";
import { AllPostsFilters } from "../AllPostsFilters";
import { PostListCards } from "../PostListCards";
import { Pagination } from "@/components/ui/Pagination";

export const dynamic = "force-dynamic";

export default async function PostedPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; platform?: string; time?: string; account?: string; page?: string }>;
}) {
  const params = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const {
    userPosts,
    publicationsByPostId,
    firstMediaByPost,
    platformOptions,
    accountOptions,
    resurfaceByPostId,
    autoPlugByPostId,
    totalCount,
  } = await getPostsListData({
    userId: session.user.id,
    statusFilter: "published",
    sort: params.sort === "oldest" ? "oldest" : "newest",
    platform: params.platform || null,
    time: params.time || null,
    account: params.account || null,
    page,
    limit: POSTS_PAGE_SIZE,
  });

  const hasActiveFilters = !!(params.platform || params.time || params.account);
  const { use24HourTimeFormat, dateFormat } = await getUserSettingsSnapshot();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-text">Posted</h2>
          <p className="text-text-muted mt-1 font-medium">
            Published posts
          </p>
        </div>
        <Link
          href="/dashboard/posts"
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          View all posts →
        </Link>
      </div>

      <div className="mb-6">
        <Suspense fallback={<div className="h-10 w-48 rounded-lg bg-bg-muted animate-pulse" />}>
          <AllPostsFilters
            platformOptions={platformOptions}
            accountOptions={accountOptions}
            basePath="/dashboard/posts/posted"
          />
        </Suspense>
      </div>

      <PostListCards
        userPosts={userPosts}
        publicationsByPostId={publicationsByPostId}
        firstMediaByPost={firstMediaByPost}
        resurfaceByPostId={resurfaceByPostId}
        autoPlugByPostId={autoPlugByPostId}
        emptyMessage="You haven't published any posts yet."
        filterMessage="No posted content matches your filters."
        hasActiveFilters={hasActiveFilters}
        use24HourTimeFormat={use24HourTimeFormat}
        dateFormat={dateFormat}
      />

      <Pagination
        currentPage={page}
        totalPages={Math.ceil(totalCount / POSTS_PAGE_SIZE) || 1}
        basePath="/dashboard/posts/posted"
        searchParams={{
          sort: params.sort,
          platform: params.platform,
          time: params.time,
          account: params.account,
        }}
      />
    </div>
  );
}
