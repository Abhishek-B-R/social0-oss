"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadCalendarPageData } from "@/app/actions/dashboard-data";
import { CalendarClient, type PostForCalendar } from "./CalendarClient";
import { DOCS_CALENDAR_URL } from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";

export function CalendarPageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [data, setData] = useState<{
    posts: PostForCalendar[];
    initialMonth: string;
    use24HourTimeFormat: boolean;
    dateFormat: string | null;
    timezone: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadCalendarPageData();
      if (cancelled) return;
      if (!result.ok) {
        if (result.error === "Unauthorized") {
          setIsGuest(true);
          setLoading(false);
          return;
        }
        setError(result.error);
        setLoading(false);
        return;
      }
      setData(result.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading && !isGuest) {
    return <DashboardPageSkeleton message="Loading calendar..." />;
  }

  if (isGuest) {
    return (
      <GuestPostsPageView
        pageTitle="Calendar"
        pageDescription="View your scheduled and published posts by month, week, or day."
        promptTitle="Sign in to see your calendar"
        promptDescription="Your calendar will show scheduled and published posts once you sign in."
      />
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {error ?? "Could not load calendar."}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="mb-2 font-serif text-2xl font-semibold tracking-tight text-foreground landing flex items-center gap-2 sm:text-3xl">
            Calendar
          </h1>
          <DocsInfoIcon url={DOCS_CALENDAR_URL} />
        </div>
        <p className="mt-1.5 text-sm text-text-muted sm:mt-2">
          View your scheduled and published posts by month, week, or day.
        </p>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col sm:mt-6">
        <CalendarClient
          posts={data.posts}
          initialMonth={data.initialMonth}
          use24HourTimeFormat={data.use24HourTimeFormat}
          dateFormat={data.dateFormat}
          timezone={data.timezone}
        />
      </div>
    </div>
  );
}
