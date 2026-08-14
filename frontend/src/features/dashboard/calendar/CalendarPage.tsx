import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { loadCalendarPageData } from "@/api/dashboard-data";
import { CalendarGrid } from "./CalendarGrid";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { useSession } from "@/lib/auth-client";

export function CalendarPage() {
  const { data: session, isPending: sessionPending } = useSession();

  const { data: result, isLoading } = useQuery({
    queryKey: ["calendar-page"],
    queryFn: loadCalendarPageData,
    enabled: !!session,
  });

  if (sessionPending || (session && isLoading && !result)) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        aria-busy
        aria-label="Loading calendar"
      >
        <div className="shrink-0">
          <h1 className="mb-2 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
            Calendar
          </h1>
          <p className="mt-1.5 text-sm text-text-muted sm:mt-2">
            View your scheduled and published posts by month, week, or day.
          </p>
        </div>
        <div className="mt-4 flex min-h-0 flex-1 flex-col sm:mt-6">
          <CalendarGrid
            posts={[]}
            initialMonth={format(new Date(), "yyyy-MM")}
            use24HourTimeFormat={false}
            dateFormat={null}
            timezone={null}
            loading
          />
        </div>
      </div>
    );
  }

  if (!session || (result && !result.ok && result.error === "Unauthorized")) {
    return (
      <GuestPostsPageView
        pageTitle="Calendar"
        pageDescription="View your scheduled and published posts by month, week, or day."
        promptTitle="Sign in to see your calendar"
        promptDescription="Your calendar will show scheduled and published posts once you sign in."
      />
    );
  }

  if (result && !result.ok) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {result.error}
      </div>
    );
  }

  const data = result?.ok ? result.data : null;
  const postsLoading = !data;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      aria-busy={postsLoading}
      aria-label={postsLoading ? "Loading calendar" : undefined}
    >
      <div className="shrink-0">
        <h1 className="mb-2 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
          Calendar
        </h1>
        <p className="mt-1.5 text-sm text-text-muted sm:mt-2">
          View your scheduled and published posts by month, week, or day.
        </p>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col sm:mt-6">
        <CalendarGrid
          posts={data?.posts ?? []}
          initialMonth={data?.initialMonth ?? format(new Date(), "yyyy-MM")}
          use24HourTimeFormat={data?.use24HourTimeFormat ?? false}
          dateFormat={data?.dateFormat ?? null}
          timezone={data?.timezone ?? null}
          loading={postsLoading}
        />
      </div>
    </div>
  );
}
