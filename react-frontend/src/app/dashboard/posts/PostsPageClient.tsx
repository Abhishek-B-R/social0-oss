"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { loadPostsPageData } from "@/app/actions/dashboard-data";
import type { PublicationRow } from "@/app/dashboard/posts/posts-list-types";
import { POSTS_PAGE_SIZE } from "@/app/dashboard/posts/posts-constants";
import { AllPostsFilters } from "./AllPostsFilters";
import { PostListCards } from "./PostListCards";
import { Pagination } from "@/components/ui/Pagination";
import { DOCS_POSTS_URL } from "@/lib/docs-url";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";

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
    { mimeType: string; originalFilename: string | null }
  >;
  queuedPostIds: string[];
}): {
  userPosts: PostRow[];
  publicationsByPostId: Record<string, PublicationRow[]>;
  firstMediaByPost: Map<string, { mimeType: string; originalFilename: string | null }>;
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

export function PostsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Awaited<
    ReturnType<typeof loadPostsPageData>
  > | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  const sort = searchParams.get("sort") || "newest";
  const platform = searchParams.get("platform");
  const time = searchParams.get("time");
  const account = searchParams.get("account");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const tiktokPublished = searchParams.get("tiktok_published") === "true";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadPostsPageData({
      sort,
      platform: platform || null,
      time: time || null,
      account: account || null,
      page,
    });
    if (!result.ok) {
      if (result.error === "Unauthorized") {
        setIsGuest(true);
        setPayload(null);
        setLoading(false);
        return;
      }
      setError(result.error);
      setPayload(null);
      setLoading(false);
      return;
    }
    setPayload(result);
    setLoading(false);
  }, [sort, platform, time, account, page, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const hydrated = useMemo(() => {
    if (!payload || !payload.ok) return null;
    return hydrateFromSerialized({
      userPosts: payload.data.userPosts,
      publicationsByPostId: payload.data.publicationsByPostId,
      firstMediaByPost: payload.data.firstMediaByPost,
      queuedPostIds: payload.data.queuedPostIds,
    });
  }, [payload]);

  const hasActiveFilters = !!(platform || time || account);

  if (loading && !payload && !isGuest) {
    return <DashboardPageSkeleton message="Loading posts..." />;
  }

  if (isGuest) {
    return (
      <GuestPostsPageView
        pageTitle="Posts"
        pageDescription="View and manage your drafts, scheduled posts, and published content."
      />
    );
  }

  if (error || !payload?.ok || !hydrated) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {error ?? "Could not load posts."}
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
  } = payload.data;

  return (
    <div>
      {showPaymentFailedBanner && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400 sm:mb-6">
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span className="min-w-0 flex-1">
            Some posts failed to publish because your trial ended.
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
          <h2 className="mb-1.5 flex items-center gap-2 font-serif text-2xl font-bold tracking-tight text-foreground landing sm:mb-2 sm:text-3xl">
            All Posts
            <a
              href={DOCS_POSTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full p-1.5 text-text-muted transition-colors hover:bg-muted hover:text-text"
              title="Documentation for this page"
              aria-label="Documentation for this page"
            >
              <svg
                className="h-4 w-4"
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

      <div className={`mb-6 ${loading ? "opacity-60" : ""}`}>
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
