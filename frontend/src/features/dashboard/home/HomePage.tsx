import { useQuery } from "@tanstack/react-query";
import type { DashboardHomeData } from "@/api/dashboard";
import { loadDashboardLayoutData } from "@/api/dashboard-data";
import Link from "@/components/AppLink";
import {
  ErrorState,
  InlineError,
  PageContainer,
  PageHeader,
  Skeleton,
  SkeletonCard,
  useDashboardPath,
} from "@/components/app";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { BestPostCard } from "./BestPostCard";
import { formatTz } from "./home-format";
import { NeedsAttention } from "./NeedsAttention";
import { QuickCompose } from "./QuickCompose";
import { RecentActivity } from "./RecentActivity";
import { SetupChecklist } from "./SetupChecklist";
import { TodayTimeline } from "./TodayTimeline";
import { useHomeData } from "./use-home-data";

function Pipeline({ data }: { data: DashboardHomeData }) {
  const dash = useDashboardPath();
  const c = data.counts;
  const items = [
    // Number first, so the noun follows it: "1 Draft", "3 Drafts".
    { label: c.drafts - c.needsReview === 1 ? "Draft" : "Drafts", count: Math.max(0, c.drafts - c.needsReview), href: dash("posts?tab=drafts") },
    { label: "Needs review", count: c.needsReview, href: dash("posts?tab=review"), title: "Drafts from your AI agents waiting for you" },
    { label: "Scheduled", count: c.scheduled, href: dash("posts?tab=scheduled") },
    ...(c.publishing > 0
      ? [{ label: "Publishing", count: c.publishing, href: dash("posts") }]
      : []),
    {
      label: "Failed",
      count: c.failed,
      href: dash("posts?tab=failed"),
      danger: c.failed > 0,
      title: "Failed in the last 14 days",
    },
  ];
  // Segmented counts, number first: "3 Drafts  0 Needs review  3 Scheduled".
  // Zero reads quiet; Failed turns red only when something failed.
  return (
    <nav aria-label="Posts by status" className="-mx-2 flex flex-wrap items-center gap-x-1 text-[13px]">
      {items.map((item) => {
        const danger = "danger" in item && item.danger;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.title}
            className={cn(
              "inline-flex items-baseline gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              danger ? "text-danger" : "text-text-muted hover:text-text",
            )}
          >
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                danger ? "text-danger" : item.count > 0 ? "text-text" : "text-text-subtle",
              )}
            >
              {item.count}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy aria-label="Loading your home page">
      <PageContainer stack>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="hidden h-[3.25rem] w-full rounded-xl sm:block" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      </PageContainer>
    </div>
  );
}

/**
 * Home (mock 02·A, "Triage stack"): know in five seconds what's going out,
 * what broke and what needs you. One DB-only RPC (`dashboard.getHome`); the
 * best-post card loads live analytics afterwards and hides without data.
 */
export function HomePage() {
  const { data: session } = useSession();
  const home = useHomeData();
  const { data: layout } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    enabled: !!session,
    retry: false,
  });

  if (!home.data) {
    if (!home.isError) return <HomeSkeleton />;
    return (
      <PageContainer>
        <PageHeader title="Home" />
        <ErrorState
          message="Couldn't load your home page."
          detail={home.error instanceof Error ? home.error.message : null}
          onRetry={() => void home.refetch()}
          retrying={home.isFetching}
        />
      </PageContainer>
    );
  }

  const data = home.data;
  const perms = data.permissions;
  const now = new Date();
  const todayTotal = data.todayPosts.length;
  const todayCount = data.todayPosts.filter(
    (p) => p.status === "scheduled" || p.status === "publishing",
  ).length;
  // Failed or only partly delivered today: never "everything has gone out".
  const todayProblems = data.todayPosts.filter(
    (p) => p.status === "failed" || p.status === "partial",
  ).length;
  const subtitleParts: string[] = [];
  if (todayCount > 0) {
    subtitleParts.push(`${todayCount} post${todayCount === 1 ? "" : "s"} going out today`);
    if (todayProblems > 0) {
      subtitleParts.push(`${todayProblems} need${todayProblems === 1 ? "s" : ""} attention`);
    }
  } else if (todayTotal === 0) {
    subtitleParts.push("Nothing going out today");
  } else if (todayProblems === 0) {
    subtitleParts.push("Everything for today has gone out");
  } else if (todayProblems === todayTotal) {
    subtitleParts.push(
      todayTotal === 1 ? "Today's post needs attention" : `Today's ${todayTotal} posts need attention`,
    );
  } else {
    subtitleParts.push(`${todayProblems} of today's ${todayTotal} posts need attention`);
  }
  if (data.workspace.teamName) subtitleParts.push(data.workspace.teamName);

  return (
    <PageContainer stack>
      <PageHeader
        title={formatTz(now, data.timezone, "EEEE, d MMMM")}
        subtitle={subtitleParts.join(" · ")}
        actions={<Pipeline data={data} />}
      />

      {home.isError ? (
        <InlineError
          message="Couldn't refresh. Showing what we loaded earlier."
          onRetry={() => void home.refetch()}
        />
      ) : null}

      {perms.canCreatePosts ? (
        <div className="hidden sm:block">
          <QuickCompose
            timezone={data.timezone}
            today={data.today}
            canPublish={perms.canPublishPosts}
            use24h={data.use24HourTimeFormat ?? false}
          />
        </div>
      ) : null}

      <NeedsAttention data={data} freePosts={layout?.freePostsBanner ?? null} />

      <SetupChecklist data={data} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <TodayTimeline data={data} />
        <RecentActivity data={data} />
      </div>

      {perms.canViewAnalytics && data.setup.hasPublished ? (
        <BestPostCard canPublish={perms.canPublishPosts} />
      ) : null}
    </PageContainer>
  );
}

export default HomePage;
