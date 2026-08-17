import { Suspense } from "react";
import { PostsPage as PostsPageView } from "@/features/dashboard/posts/PostsPage";
import { BillingPage as BillingPageView } from "@/features/dashboard/billing/BillingPage";
import { CalendarPage as CalendarPageView } from "@/features/dashboard/calendar/CalendarPage";
import { AnalyticsPage as AnalyticsPageView } from "@/features/dashboard/analytics/AnalyticsPage";
import { ConnectionsPage as ConnectionsPageView } from "@/features/dashboard/connections/ConnectionsPage";
import { SettingsPage as SettingsPageView } from "@/pages/SettingsPage";
import { FeedbackPage as FeedbackPageView } from "@/features/dashboard/feedback/FeedbackPage";
import { TeamsPage as TeamsPageView } from "@/features/dashboard/teams/TeamsPage";
import { TeamDetailPage as TeamDetailPageView } from "@/features/dashboard/teams/TeamDetailPage";
import { CreateTeamPage as CreateTeamPageView } from "@/features/dashboard/teams/CreateTeamPage";
import { WorkspacesPage as WorkspacesPageView } from "@/features/dashboard/workspaces/WorkspacesPage";
import {
  BillingPageSkeleton,
  CreateTeamPageSkeleton,
  FeedbackPageSkeleton,
  PostsPageSkeleton,
  SettingsPageSkeleton,
  TeamDetailPageSkeleton,
  TeamsPageSkeleton,
  WorkspacesPageSkeleton,
} from "@/components/ui/page-skeletons";

export function PostsPage() {
  return (
    <Suspense fallback={<PostsPageSkeleton />}>
      <PostsPageView />
    </Suspense>
  );
}

export function BillingPage() {
  return (
    <Suspense fallback={<BillingPageSkeleton />}>
      <BillingPageView />
    </Suspense>
  );
}

export function CalendarPage() {
  return <CalendarPageView />;
}

export function AnalyticsPage() {
  return <AnalyticsPageView />;
}

export function ConnectionsPage() {
  return <ConnectionsPageView />;
}

export function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsPageView />
    </Suspense>
  );
}

export function FeedbackPageRoute() {
  return (
    <Suspense fallback={<FeedbackPageSkeleton />}>
      <FeedbackPageView />
    </Suspense>
  );
}

export function TeamsPage() {
  return (
    <Suspense fallback={<TeamsPageSkeleton />}>
      <TeamsPageView />
    </Suspense>
  );
}

export function WorkspacesPage() {
  return (
    <Suspense fallback={<WorkspacesPageSkeleton />}>
      <WorkspacesPageView />
    </Suspense>
  );
}

export function CreateTeamPage() {
  return (
    <Suspense fallback={<CreateTeamPageSkeleton />}>
      <CreateTeamPageView />
    </Suspense>
  );
}

export function TeamDetailPage() {
  return (
    <Suspense fallback={<TeamDetailPageSkeleton />}>
      <TeamDetailPageView />
    </Suspense>
  );
}
