import { auth } from "@/lib/auth";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { getPostsListData, POSTS_PAGE_SIZE } from "../posts-list-data";
import { AllPostsFilters } from "../AllPostsFilters";
import { PostListCards } from "../PostListCards";
import { Pagination } from "@/components/ui/Pagination";
import { MdQuestionMark } from "react-icons/md";
import { DOCS_POSTS_DRAFTS_URL } from "@/lib/docs-url";

export const dynamic = "force-dynamic";

export default async function DraftsPostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    platform?: string;
    time?: string;
    account?: string;
    page?: string;
  }>;
}) {
  const [params, session] = await Promise.all([
    searchParams,
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!session) return null;

  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [
    {
      userPosts,
      publicationsByPostId,
      firstMediaByPost,
      platformOptions,
      accountOptions,
      resurfaceByPostId,
      totalCount,
    },
    settings,
  ] = await Promise.all([
    getPostsListData({
      userId: session.user.id,
      statusFilter: "draft",
      sort: params.sort === "oldest" ? "oldest" : "newest",
      platform: params.platform || null,
      time: params.time || null,
      account: params.account || null,
      page,
      limit: POSTS_PAGE_SIZE,
    }),
    getUserSettingsSnapshot(),
  ]);

  const hasActiveFilters = !!(params.platform || params.time || params.account);
  const { use24HourTimeFormat, dateFormat } = settings;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex gap-2">
            <h2 className="text-3xl font-bold font-serif tracking-tight text-foreground mb-2 landing">
              Drafts
            </h2>
            <a
              href={DOCS_POSTS_DRAFTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full -mt-2 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
              title="Documentation for this page"
              aria-label="Documentation for this page"
            >
              <svg
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </div>
          <p className="text-text-muted mt-1 font-medium">Saved drafts</p>
        </div>
        <Link
          href="/dashboard/posts"
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          View all posts →
        </Link>
      </div>

      <div className="mb-6">
        <Suspense
          fallback={
            <div className="h-10 w-48 rounded-lg bg-bg-muted animate-pulse" />
          }
        >
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
        emptyMessage="You have no drafts."
        filterMessage="No drafts match your filters."
        hasActiveFilters={hasActiveFilters}
        use24HourTimeFormat={use24HourTimeFormat}
        dateFormat={dateFormat}
      />

      <Pagination
        currentPage={page}
        totalPages={Math.ceil(totalCount / POSTS_PAGE_SIZE) || 1}
        basePath="/dashboard/posts/drafts"
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
