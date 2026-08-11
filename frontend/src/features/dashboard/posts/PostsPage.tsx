
import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import Link from "@/components/AppLink";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { loadPostsPageData } from "@/api/dashboard-data";
import type { PublicationRow } from "@/features/dashboard/posts/posts-list-types";
import { POSTS_PAGE_SIZE } from "@/features/dashboard/posts/posts-constants";
import { AllPostsFilters } from "./AllPostsFilters";
import { PostListCards } from "./PostListCards";
import { Pagination } from "@/components/ui/Pagination";
import { PostsPageSkeleton } from "@/components/ui/page-skeletons";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { useSession } from "@/lib/auth-client";

type PostRow = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: Date | null;
  failureReason: string | null;
  createdAt: Date | null;
  mediaIds: string[] | null;
  metadata?: Record<string, unknown> | null;
};

function hydrateFromSerialized(data: {
  userPosts: Array<{
    id: string;
    originalContent: string | null;
    status: string | null;
    scheduledAt: string | null;
    failureReason: string | null;
    createdAt: string | null;
    mediaIds: string[] | null;
    metadata: unknown;
  }>;
  publicationsByPostId: Record<
    string,
    Array<Omit<PublicationRow, "publishedAt"> & { publishedAt: string | null }>
  >;
  firstMediaByPost: Record<
    string,
    {
      mimeType: string;
      originalFilename: string | null;
      url: string | null;
      thumbnailUrl: string | null;
    }
  >;
  queuedPostIds: string[];
}): {
  userPosts: PostRow[];
  publicationsByPostId: Record<string, PublicationRow[]>;
  firstMediaByPost: Map<
    string,
    {
      mimeType: string;
      originalFilename: string | null;
      url: string | null;
      thumbnailUrl: string | null;
    }
  >;
  queuedPostIds: Set<string>;
} {
  const userPosts: PostRow[] = data.userPosts.map((p) => ({
    id: p.id,
    originalContent: p.originalContent,
    status: p.status,
    scheduledAt: p.scheduledAt ? new Date(p.scheduledAt) : null,
    failureReason: p.failureReason,
    createdAt: p.createdAt ? new Date(p.createdAt) : null,
    mediaIds: p.mediaIds,
    metadata:
      p.metadata != null && typeof p.metadata === "object"
        ? (p.metadata as Record<string, unknown>)
        : null,
  }));

  const publicationsByPostId: Record<string, PublicationRow[]> = {};
  for (const [postId, pubs] of Object.entries(data.publicationsByPostId)) {
    publicationsByPostId[postId] = pubs.map((pub) => ({
      ...pub,
      publishedAt: pub.publishedAt ? new Date(pub.publishedAt) : null,
    }));
  }

  return {
    userPosts,
    publicationsByPostId,
    firstMediaByPost: new Map(Object.entries(data.firstMediaByPost)),
    queuedPostIds: new Set(data.queuedPostIds),
  };
}

export function PostsPage() {
  const [searchParams] = useSearchParams();
  const { data: session, isPending: sessionPending } = useSession();

  const sort = searchParams.get("sort") || "newest";
  const platform = searchParams.get("platform");
  const time = searchParams.get("time");
  const account = searchParams.get("account");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const tiktokPublished = searchParams.get("tiktok_published") === "true";

  const {
    data: result,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["posts-page", sort, platform, time, account, page],
    queryFn: () =>
      loadPostsPageData({
        sort,
        platform: platform || null,
        time: time || null,
        account: account || null,
        page,
      }),
    enabled: !!session,
  });

  const hydrated = useMemo(() => {
    if (!result?.ok) return null;
    return hydrateFromSerialized({
      userPosts: result.data.userPosts,
      publicationsByPostId: result.data.publicationsByPostId,
      firstMediaByPost: result.data.firstMediaByPost,
      queuedPostIds: result.data.queuedPostIds,
    });
  }, [result]);

  const hasActiveFilters = !!(platform || time || account);

  if (sessionPending) {
    return <PostsPageSkeleton />;
  }

  if (!session) {
    return (
      <GuestPostsPageView
        pageTitle="Posts"
        pageDescription="View and manage your drafts, scheduled posts, and published content."
      />
    );
  }

  if (isLoading && !result) {
    return <PostsPageSkeleton />;
  }

  if (isError || !result?.ok || !hydrated) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        <p className="text-muted-foreground">
          {isError
            ? (error instanceof Error ? error.message : "Could not load posts.")
            : (result && !result.ok ? result.error : "Could not load posts.")}
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

  const {
    showPaymentFailedBanner,
    use24HourTimeFormat,
    dateFormat,
    timezone,
    platformOptions,
    accountOptions,
    totalCount,
    resurfaceByPostId,
  } = result.data;

  return (
    <div>
      {showPaymentFailedBanner && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400 sm:mb-6">
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span className="min-w-0 flex-1">
            Some posts failed to publish because your plan is inactive.
          </span>
          <Link
            href="/dashboard/billing"
            className="inline-flex min-h-[44px] shrink-0 items-center font-medium underline underline-offset-2 touch-manipulation active:opacity-90"
          >
            Upgrade now →
          </Link>
        </div>
      )}
      {tiktokPublished && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/40 sm:mb-6">
          <p className="text-sm font-medium leading-snug text-blue-800 dark:text-blue-200">
            ✅ Post published successfully! Your TikTok content may take a few
            minutes to process and appear on your profile.
          </p>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6 sm:gap-4">
        <div className="min-w-0">
          <h2 className="mb-1.5 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight sm:mb-2">
            All Posts
          </h2>
          <p className="mt-1 text-sm font-medium text-text-muted sm:text-base">
            Your drafts, scheduled, and published posts
          </p>
        </div>
        <Link
          href="/dashboard/composer"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lg transition-colors hover:bg-accent-hover touch-manipulation active:opacity-95 sm:py-2.5"
        >
          Create post
        </Link>
      </div>

      <div className={`mb-6 ${isFetching ? "opacity-80" : ""}`}>
        <AllPostsFilters
          platformOptions={platformOptions}
          accountOptions={accountOptions}
        />
      </div>

      <PostListCards
        userPosts={hydrated.userPosts}
        publicationsByPostId={hydrated.publicationsByPostId}
        firstMediaByPost={hydrated.firstMediaByPost}
        resurfaceByPostId={resurfaceByPostId}
        queuedPostIds={hydrated.queuedPostIds}
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
          sort: sort === "newest" ? undefined : sort,
          platform: platform ?? undefined,
          time: time ?? undefined,
          account: account ?? undefined,
        }}
      />
    </div>
  );
}
