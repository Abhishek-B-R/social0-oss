import { Suspense } from "react";
import { PostsPage as PostsPageView } from "@/features/dashboard/posts/PostsPage";
import { BillingPage as BillingPageView } from "@/features/dashboard/billing/BillingPage";
import { CalendarPage as CalendarPageView } from "@/features/dashboard/calendar/CalendarPage";
import { ConnectionsPage as ConnectionsPageView } from "@/features/dashboard/connections/ConnectionsPage";
import { SettingsPage as SettingsPageView } from "@/pages/SettingsPage";
import { FeedbackPage as FeedbackPageView } from "@/features/dashboard/feedback/FeedbackPage";
import { TeamsPage as TeamsPageView } from "@/features/dashboard/teams/TeamsPage";
import { TeamDetailPage as TeamDetailPageView } from "@/features/dashboard/teams/TeamDetailPage";
import { CreateTeamPage as CreateTeamPageView } from "@/features/dashboard/teams/CreateTeamPage";
import { WorkspacesPage as WorkspacesPageView } from "@/features/dashboard/workspaces/WorkspacesPage";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export function PostsPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading posts..." />}>
      <PostsPageView />
    </Suspense>
  );
}

export function BillingPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading billing..." />}>
      <BillingPageView />
    </Suspense>
  );
}

export function CalendarPage() {
  return <CalendarPageView />;
}

export function ConnectionsPage() {
  return <ConnectionsPageView />;
}

export function SettingsPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading settings..." />}>
      <SettingsPageView />
    </Suspense>
  );
}

export function FeedbackPageRoute() {
  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading feedback..." />}>
      <FeedbackPageView />
    </Suspense>
  );
}

export function TeamsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-8 w-56 rounded-md bg-bg-muted" />
          <div className="h-4 w-72 max-w-full rounded bg-bg-muted/70" />
          <div className="h-24 rounded-xl border border-border bg-bg-elevated" />
          <div className="h-40 rounded-xl border border-border bg-bg-elevated" />
        </div>
      }
    >
      <TeamsPageView />
    </Suspense>
  );
}

export function WorkspacesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-8 w-48 rounded-md bg-bg-muted" />
          <div className="h-4 w-80 max-w-full rounded bg-bg-muted/70" />
          <div className="h-28 rounded-xl border border-border bg-bg-elevated" />
          <div className="h-40 rounded-xl border border-border bg-bg-elevated" />
        </div>
      }
    >
      <WorkspacesPageView />
    </Suspense>
  );
}

export function CreateTeamPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg space-y-4">
          <div className="h-8 w-48 rounded-md bg-bg-muted" />
          <div className="h-48 rounded-xl border border-border bg-bg-elevated" />
        </div>
      }
    >
      <CreateTeamPageView />
    </Suspense>
  );
}

export function TeamDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <div className="h-8 w-40 rounded-md bg-bg-muted" />
          <div className="h-36 rounded-xl border border-border bg-bg-elevated" />
          <div className="h-52 rounded-xl border border-border bg-bg-elevated" />
        </div>
      }
    >
      <TeamDetailPageView />
    </Suspense>
  );
}
