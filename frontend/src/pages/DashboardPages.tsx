import { Suspense } from "react";
import { PostsPage as PostsPageView } from "@/features/dashboard/posts/PostsPage";
import { BillingPage as BillingPageView } from "@/features/dashboard/billing/BillingPage";
import { CalendarPage as CalendarPageView } from "@/features/dashboard/calendar/CalendarPage";
import { ConnectionsPage as ConnectionsPageView } from "@/features/dashboard/connections/ConnectionsPage";
import { SettingsPage as SettingsPageView } from "@/pages/SettingsPage";
import { FeedbackPage as FeedbackPageView } from "@/features/dashboard/feedback/FeedbackPage";
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
