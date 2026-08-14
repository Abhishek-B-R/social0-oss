import { Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { loadPostsPageData } from "@/api/dashboard-data";
import { AllPostsFilters } from "@/features/dashboard/posts/AllPostsFilters";
import { PostListCards } from "@/features/dashboard/posts/PostListCards";
import { Pagination } from "@/components/ui/Pagination";
import { PostsPageSkeleton } from "@/components/ui/page-skeletons";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { POSTS_PAGE_SIZE } from "@/features/dashboard/posts/posts-constants";
import { useSession } from "@/lib/auth-client";
import type { DateFormatKey } from "@/lib/date-format";

type StatusPostsConfig = {
  statusFilter: "draft" | "scheduled" | "posted";
  title: string;
  description: string;
  basePath: string;
  emptyMessage: string;
  emptyCtaLabel: string;
  guestTitle: string;
  guestDescription: string;
};

export function StatusPostsPage({ config }: { config: StatusPostsConfig }) {
  const [searchParams] = useSearchParams();
  const { data: session, isPending: sessionPending } = useSession();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "status-posts",
      config.statusFilter,
      searchParams.toString(),
      page,
    ],
    queryFn: () =>
      loadPostsPageData({
        statusFilter: config.statusFilter,
        sort: searchParams.get("sort"),
        platform: searchParams.get("platform"),
        time: searchParams.get("time"),
        account: searchParams.get("account"),
        page,
      }),
    enabled: !!session,
  });

  if (sessionPending) {
    return (
      <PostsPageSkeleton
        title={config.title}
        description={config.description}
        action="view-all"
      />
    );
  }

  if (!session) {
    return (
      <GuestPostsPageView
        pageTitle={config.title}
        pageDescription={config.description}
        promptTitle={config.guestTitle}
        promptDescription={config.guestDescription}
      />
    );
  }

  if (isLoading && !result) {
    return (
      <PostsPageSkeleton
        title={config.title}
        description={config.description}
        action="view-all"
      />
    );
  }

  if (isError || !result?.ok) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        <p className="text-muted-foreground">
          {isError
            ? (error instanceof Error ? error.message : `Could not load ${config.title.toLowerCase()}.`)
            : (result && !result.ok ? result.error : `Could not load ${config.title.toLowerCase()}.`)}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    );
  }

  const data = result.data;
  const params = Object.fromEntries(searchParams.entries());
  const hasActiveFilters = !!(params.platform || params.time || params.account);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="mb-2 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
            {config.title}
          </h2>
          <p className="text-text-muted mt-1 font-medium">{config.description}</p>
        </div>
        <Link
          to="/dashboard/posts"
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          View all posts →
        </Link>
      </div>

      <div className="mb-6">
        <Suspense fallback={<div className="h-10 w-48 rounded-lg bg-bg-muted animate-pulse" />}>
          <AllPostsFilters
            platformOptions={data.platformOptions}
            accountOptions={data.accountOptions}
            basePath={config.basePath}
          />
        </Suspense>
      </div>

      <PostListCards
        userPosts={data.userPosts.map((p) => ({
          ...p,
          scheduledAt: p.scheduledAt ? new Date(p.scheduledAt) : null,
          createdAt: p.createdAt ? new Date(p.createdAt) : null,
          metadata: (p.metadata ?? null) as Record<string, unknown> | null,
        }))}
        publicationsByPostId={Object.fromEntries(
          Object.entries(data.publicationsByPostId).map(([k, pubs]) => [
            k,
            pubs.map((p) => ({
              ...p,
              publishedAt: p.publishedAt ? new Date(p.publishedAt) : null,
            })),
          ]),
        )}
        firstMediaByPost={new Map(Object.entries(data.firstMediaByPost))}
        resurfaceByPostId={data.resurfaceByPostId}
        queuedPostIds={new Set(data.queuedPostIds)}
        emptyMessage={config.emptyMessage}
        emptyCtaLabel={config.emptyCtaLabel}
        filterMessage={`No ${config.title.toLowerCase()} match your filters.`}
        hasActiveFilters={hasActiveFilters}
        use24HourTimeFormat={data.use24HourTimeFormat}
        dateFormat={data.dateFormat as DateFormatKey}
      />

      <Pagination
        currentPage={page}
        totalPages={Math.ceil(data.totalCount / POSTS_PAGE_SIZE) || 1}
        basePath={config.basePath}
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

export function DraftsPostsPage() {
  return (
    <StatusPostsPage
      config={{
        statusFilter: "draft",
        title: "Drafts",
        description: "Saved drafts",
        basePath: "/dashboard/posts/drafts",
        emptyMessage: "You have no drafts.",
        emptyCtaLabel: "Create a post",
        guestTitle: "Sign in to see your drafts",
        guestDescription: "Your saved drafts will appear here after you sign in.",
      }}
    />
  );
}

export function ScheduledPostsPage() {
  return (
    <StatusPostsPage
      config={{
        statusFilter: "scheduled",
        title: "Scheduled",
        description: "Upcoming scheduled posts",
        basePath: "/dashboard/posts/scheduled",
        emptyMessage: "You have no scheduled posts.",
        emptyCtaLabel: "Schedule a post",
        guestTitle: "Sign in to see scheduled posts",
        guestDescription: "Your scheduled posts will appear here after you sign in.",
      }}
    />
  );
}

export function PostedPostsPage() {
  return (
    <StatusPostsPage
      config={{
        statusFilter: "posted",
        title: "Posted",
        description: "Published posts",
        basePath: "/dashboard/posts/posted",
        emptyMessage: "You have no published posts yet.",
        emptyCtaLabel: "Create a post",
        guestTitle: "Sign in to see posted content",
        guestDescription: "Your published posts will appear here after you sign in.",
      }}
    />
  );
}
