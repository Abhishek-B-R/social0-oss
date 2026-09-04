import { SkeletonBone } from "@/components/ui/skeleton-bone";
import Link from "@/components/AppLink";
import { Filter } from "lucide-react";
import { format } from "date-fns";
import { CalendarGrid } from "@/features/dashboard/calendar/CalendarGrid";
import { ConnectionsList } from "@/components/dashboard/ConnectionsList";

/** Matches PostListCards card chrome: type + status, caption, footer avatar/time. */
function PostCardSkeleton() {
  return (
    <li className="relative flex h-full flex-col overflow-hidden rounded-[12px] border border-border bg-card">
      <div className="flex min-h-[11.5rem] flex-1 flex-col">
        <div className="flex flex-1 flex-col p-4 pb-3 pr-12">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <SkeletonBone className="h-5 w-10 rounded-md" />
            <SkeletonBone className="h-5 w-14 rounded-md" />
          </div>
          <SkeletonBone className="mb-1.5 h-4 w-[92%]" />
          <SkeletonBone className="mb-2 h-4 w-[68%]" />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 bg-muted/50 px-3 py-2">
          <div className="flex items-center -space-x-2.5 pl-0.5 pt-0.5">
            <SkeletonBone className="h-7 w-7 rounded-full ring-2 ring-muted" />
            <SkeletonBone className="h-7 w-7 rounded-full ring-2 ring-muted" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <SkeletonBone className="h-2.5 w-14" />
            <SkeletonBone className="h-2.5 w-20" />
            <SkeletonBone className="h-2.5 w-12" />
          </div>
        </div>
      </div>
    </li>
  );
}

function PostsFiltersSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2" aria-hidden>
      <Filter className="h-4 w-4 shrink-0 text-text-muted" />
      <SkeletonBone className="h-10 w-[8.5rem] rounded-lg sm:h-9" />
      <SkeletonBone className="h-10 w-[9.5rem] rounded-lg sm:h-9" />
      <SkeletonBone className="h-10 w-[7.5rem] rounded-lg sm:h-9" />
      <SkeletonBone className="h-10 w-[8.5rem] rounded-lg sm:h-9" />
    </div>
  );
}

/** 3-col × 4-row post grid that mirrors /dashboard/posts after load. */
export function PostsPageSkeleton({
  title = "All Posts",
  description = "Your drafts, scheduled, and published posts",
  action = "create",
}: {
  title?: string;
  description?: string;
  /** Create CTA (All Posts) vs “View all” link chrome (status pages). */
  action?: "create" | "view-all" | "none";
}) {
  return (
    <div aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6 sm:gap-4">
        <div className="min-w-0">
          <h2 className="mb-2 dash-page-title">
            {title}
          </h2>
          <p className="mt-1 text-sm font-medium text-text-muted sm:text-base">
            {description}
          </p>
        </div>
        {action === "create" ? (
          <Link
            href="/dashboard/composer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lg transition-colors hover:bg-accent-hover touch-manipulation active:opacity-95 sm:py-2.5"
          >
            Create post
          </Link>
        ) : action === "view-all" ? (
          <Link
            href="/dashboard/posts"
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            View all posts →
          </Link>
        ) : null}
      </div>

      <PostsFiltersSkeleton />

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }, (_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </ul>
    </div>
  );
}

export function ConnectionsPageSkeleton() {
  return (
    <ConnectionsList accounts={[]} accountsLoading />
  );
}

export function BillingPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading billing">
      <h1 className="mb-2 dash-page-title">
        Billing
      </h1>
      <p className="mt-1 text-text-muted">
        Manage your subscription and billing.
      </p>

      <div className="mt-5 space-y-5">
        <div className="rounded-xl border border-border bg-white p-6 dark:bg-bg-elevated">
          <p className="text-sm text-muted-foreground">Current plan</p>
          <SkeletonBone className="mt-1 h-8 w-28" />
          <SkeletonBone className="mt-2 h-4 w-48" />
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Connected accounts</p>
            <SkeletonBone className="mt-1 h-8 w-20" />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <SkeletonBone className="h-10 w-44 rounded-xl" />
            <SkeletonBone className="h-10 w-40 rounded-xl" />
          </div>
        </div>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Plans</h2>
            <SkeletonBone className="h-9 w-36 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="flex flex-col rounded-xl border border-border bg-bg-elevated p-5"
              >
                <SkeletonBone className="h-6 w-20" />
                <SkeletonBone className="mt-3 h-8 w-24" />
                <SkeletonBone className="mt-2 h-4 w-full" />
                <div className="mt-4 space-y-2">
                  <SkeletonBone className="h-3.5 w-[90%]" />
                  <SkeletonBone className="h-3.5 w-[80%]" />
                  <SkeletonBone className="h-3.5 w-[85%]" />
                  <SkeletonBone className="h-3.5 w-[70%]" />
                </div>
                <SkeletonBone className="mt-6 h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function CalendarPageSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      aria-busy="true"
      aria-label="Loading calendar"
    >
      <div className="shrink-0">
        <h1 className="mb-2 dash-page-title">
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
          loading
        />
      </div>
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading settings">
      <div className="mb-6">
        <h1 className="mb-2 dash-page-title">
          Settings
        </h1>
        <p className="dash-page-subtitle">
          Manage your account, security, and posting preferences.
        </p>
      </div>

      <div className="-mx-3 mb-8 flex gap-1 overflow-x-auto border-b border-border px-3 scroll-touch sm:mx-0 sm:px-0">
        {["Profile", "Preferences", "Queue", "Connections"].map((label, i) => (
          <div
            key={label}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 ${
              i === 0 ? "border-accent" : "border-transparent"
            }`}
          >
            <SkeletonBone className="h-4 w-4 rounded" />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <div className="space-y-8 pb-12">
        <section>
          <h2 className="text-lg font-semibold text-text">Profile</h2>
          <SkeletonBone className="mt-2 h-4 w-80 max-w-full" />
          <div className="mt-6 flex items-center gap-4">
            <SkeletonBone className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <SkeletonBone className="h-4 w-32" />
              <SkeletonBone className="h-9 w-48 rounded-lg" />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <SkeletonBone className="h-4 w-24" />
            <SkeletonBone className="h-10 w-full max-w-md rounded-lg" />
          </div>
        </section>
        <div className="border-t border-border" />
        <section>
          <h2 className="text-lg font-semibold text-text">Appearance</h2>
          <SkeletonBone className="mt-2 h-4 w-64 max-w-full" />
          <SkeletonBone className="mt-4 h-10 w-56 rounded-lg" />
        </section>
      </div>
    </div>
  );
}

export function TeamsPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading teams">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-2 dash-page-title">
            Teams
          </h1>
          <p className="dash-page-subtitle">
            Teams you own or have joined.
          </p>
        </div>
        <SkeletonBone className="h-9 w-28 rounded-xl" />
      </div>
      <SkeletonBone className="mt-4 h-3 w-32" />
      <ul className="mt-4 overflow-hidden rounded-xl border border-border bg-bg-elevated">
        {Array.from({ length: 4 }, (_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBone className="h-4 w-40" />
              <SkeletonBone className="h-3 w-56" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorkspacesPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading workspaces">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-2 dash-page-title">
            Workspaces
          </h1>
          <SkeletonBone className="mt-1 h-4 w-full max-w-md" />
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeletonBone className="h-9 w-36 rounded-xl" />
          <SkeletonBone className="h-9 w-24 rounded-xl" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-xl border border-border bg-bg-elevated"
          >
            <div className="flex items-start gap-3 border-b border-border px-4 py-3">
              <SkeletonBone className="mt-0.5 h-4 w-4" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBone className="h-4 w-28" />
                <SkeletonBone className="h-3 w-36" />
              </div>
            </div>
            <div className="space-y-2 px-4 py-3">
              <SkeletonBone className="h-8 w-full rounded-lg" />
              <SkeletonBone className="h-8 w-full rounded-lg" />
              <SkeletonBone className="h-8 w-[75%] rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeedbackPageSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      aria-busy="true"
      aria-label="Loading feedback"
    >
      <header className="shrink-0 border-b border-border bg-bg-elevated px-4 py-4 sm:px-6">
        <h1 className="mb-2 dash-page-title">
          Feedback or Feature Request
        </h1>
        <SkeletonBone className="mt-1 h-4 w-full max-w-xl" />
      </header>
      <div className="flex-1 space-y-3 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <SkeletonBone className="h-9 w-28 rounded-lg" />
          <SkeletonBone className="h-9 w-24 rounded-lg" />
          <SkeletonBone className="h-9 w-20 rounded-lg" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-bg-elevated p-4"
          >
            <div className="flex gap-3">
              <SkeletonBone className="h-12 w-10 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBone className="h-4 w-[70%]" />
                <SkeletonBone className="h-3 w-full" />
                <SkeletonBone className="h-3 w-[40%]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PostDetailPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading post">
      <SkeletonBone className="h-5 w-28" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="space-y-4 rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
            <SkeletonBone className="h-5 w-28" />
            <div className="space-y-2 rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900">
              <SkeletonBone className="h-4 w-full" />
              <SkeletonBone className="h-4 w-[90%]" />
              <SkeletonBone className="h-4 w-[40%]" />
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
            <SkeletonBone className="h-5 w-16" />
            <SkeletonBone className="aspect-square max-h-[200px] w-full rounded-lg" />
          </div>
        </div>
        <div className="space-y-6">
          <div className="space-y-3 rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
            <div className="flex gap-2">
              <SkeletonBone className="h-6 w-16 rounded-full" />
              <SkeletonBone className="h-6 w-16 rounded-full" />
            </div>
            <SkeletonBone className="h-9 w-28 rounded-lg" />
            <SkeletonBone className="h-3 w-40" />
            <SkeletonBone className="h-3 w-44" />
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
            <SkeletonBone className="h-5 w-32" />
            <SkeletonBone className="h-4 w-48" />
            <SkeletonBone className="h-5 w-40" />
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
            <SkeletonBone className="h-5 w-24" />
            <SkeletonBone className="h-12 w-full rounded-lg" />
            <SkeletonBone className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamDetailPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading team settings">
      <SkeletonBone className="h-5 w-28" />
      <h1 className="mt-4 dash-page-title">
        Team settings
      </h1>
      <SkeletonBone className="mt-2 h-4 w-48" />

      <div className="mt-6 space-y-5">
        <section className="rounded-xl border border-border bg-bg-elevated p-5 sm:p-6">
          <SkeletonBone className="h-4 w-32" />
          <div className="mt-4 space-y-2">
            <SkeletonBone className="h-4 w-20" />
            <SkeletonBone className="h-10 w-full max-w-md rounded-lg" />
          </div>
        </section>
        <section className="rounded-xl border border-border bg-bg-elevated p-5 sm:p-6">
          <SkeletonBone className="h-4 w-24" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <SkeletonBone className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonBone className="h-3.5 w-32" />
                  <SkeletonBone className="h-3 w-24" />
                </div>
                <SkeletonBone className="h-7 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-bg-elevated p-5 sm:p-6">
          <SkeletonBone className="h-4 w-28" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 2 }, (_, i) => (
              <SkeletonBone key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function CreateTeamPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <SkeletonBone className="h-5 w-28" />
      <SkeletonBone className="h-8 w-40" />
      <SkeletonBone className="h-4 w-64 max-w-full" />
      <div className="mt-6 max-w-lg space-y-4 rounded-xl border border-border bg-bg-elevated p-6">
        <div className="space-y-2">
          <SkeletonBone className="h-4 w-20" />
          <SkeletonBone className="h-10 w-full rounded-lg" />
        </div>
        <SkeletonBone className="h-4 w-56" />
        <SkeletonBone className="h-10 w-32 rounded-xl" />
      </div>
    </div>
  );
}

/** Table-row skeletons for Developer API keys / webhooks lists. */
export function ApiKeysTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white dark:bg-bg-elevated">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <SkeletonBone className="h-4 w-16" />
        <SkeletonBone className="h-8 w-32 rounded-lg" />
      </div>
      <div className="border-b border-border bg-bg-muted/60 px-4 py-3">
        <div className="flex gap-8">
          <SkeletonBone className="h-3.5 w-12" />
          <SkeletonBone className="h-3.5 w-10" />
          <SkeletonBone className="hidden h-3.5 w-16 sm:block" />
          <SkeletonBone className="hidden h-3.5 w-14 md:block" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
        >
          <SkeletonBone className="h-4 w-28" />
          <SkeletonBone className="h-3.5 w-24" />
          <SkeletonBone className="ml-auto hidden h-3.5 w-20 sm:block" />
          <SkeletonBone className="hidden h-3.5 w-20 md:block" />
          <SkeletonBone className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}
