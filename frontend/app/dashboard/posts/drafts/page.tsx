import { auth } from "@/lib/auth";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { getPostsListData } from "../posts-list-data";
import { AllPostsFilters } from "../AllPostsFilters";
import { PostListCards } from "../PostListCards";

export default async function DraftsPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; platform?: string; time?: string; account?: string }>;
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
    statusFilter: "draft",
    sort: params.sort === "oldest" ? "oldest" : "newest",
    platform: params.platform || null,
    time: params.time || null,
    account: params.account || null,
  });

  const hasActiveFilters = !!(params.platform || params.time || params.account);
  const { use24HourTimeFormat } = await getUserSettingsSnapshot();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-text">Drafts</h2>
          <p className="text-text-muted mt-1 font-medium">
            Saved drafts
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
            basePath="/dashboard/posts/drafts"
          />
        </Suspense>
      </div>

      <PostListCards
        userPosts={userPosts}
        publicationsByPostId={publicationsByPostId}
        firstMediaByPost={firstMediaByPost}
        resurfaceByPostId={resurfaceByPostId}
        autoPlugByPostId={autoPlugByPostId}
        emptyMessage="You have no drafts."
        filterMessage="No drafts match your filters."
        hasActiveFilters={hasActiveFilters}
        use24HourTimeFormat={use24HourTimeFormat}
      />
    </div>
  );
}
