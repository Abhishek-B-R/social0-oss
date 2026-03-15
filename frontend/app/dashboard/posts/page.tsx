import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle } from "lucide-react";
import {
  getPostsListData,
  hasPaymentFailedPosts,
  POSTS_PAGE_SIZE,
} from "./posts-list-data";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { AllPostsFilters } from "./AllPostsFilters";
import { PostListCards } from "./PostListCards";
import { Pagination } from "@/components/ui/Pagination";
import { MdQuestionMark } from "react-icons/md";
import { DOCS_POSTS_URL } from "@/lib/docs-url";

export const dynamic = "force-dynamic";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tiktok_published?: string;
    sort?: string;
    platform?: string;
    time?: string;
    account?: string;
    page?: string;
  }>;
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
    totalCount = 0,
  } = await getPostsListData({
    userId: session.user.id,
    sort: params.sort === "oldest" ? "oldest" : "newest",
    platform: params.platform || null,
    time: params.time || null,
    account: params.account || null,
    page,
    limit: POSTS_PAGE_SIZE,
  });

  const { use24HourTimeFormat, dateFormat, timezone } =
    await getUserSettingsSnapshot();

  const hasActiveFilters = !!(params.platform || params.time || params.account);
  const showTikTokMessage = params?.tiktok_published === "true";
  const showPaymentFailedBanner = await hasPaymentFailedPosts(session.user.id);

  return (
    <div>
      {showPaymentFailedBanner && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
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
      {showTikTokMessage && (
        <div className="mb-6 rounded-xl bg-blue-50 border border-blue-200 p-4 dark:bg-blue-950/40 dark:border-blue-900/60">
          <p className="text-sm text-blue-800 font-medium dark:text-blue-200">
            ✅ Post published successfully! Your TikTok content may take a few
            minutes to process and appear on your profile.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-bold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
            All Posts
            <a
              href={DOCS_POSTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
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
          </h2>
          <p className="text-text-muted mt-1 font-medium">
            Your drafts, scheduled, and published posts
          </p>
        </div>
        <Link
          href="/dashboard/composer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-lg hover:bg-accent-hover transition-colors"
        >
          Create post
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
          />
        </Suspense>
      </div>

      <PostListCards
        userPosts={userPosts}
        publicationsByPostId={publicationsByPostId}
        firstMediaByPost={firstMediaByPost}
        resurfaceByPostId={resurfaceByPostId}
        emptyMessage="You haven't created any posts yet."
        filterMessage="No posts match your filters."
        hasActiveFilters={hasActiveFilters}
        use24HourTimeFormat={use24HourTimeFormat}
        dateFormat={dateFormat}
        timezone={timezone}
      />

      <Pagination
        currentPage={page}
        totalPages={Math.max(1, Math.ceil((totalCount ?? 0) / POSTS_PAGE_SIZE))}
        basePath="/dashboard/posts"
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
