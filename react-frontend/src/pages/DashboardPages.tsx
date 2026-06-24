import { Suspense } from "react";
import { Navigate } from "react-router-dom";
import { PostsPageClient } from "@/features/dashboard/posts/PostsPageClient";
import { BillingPageClient } from "@/features/dashboard/billing/BillingPageClient";
import { CalendarPageClient } from "@/features/dashboard/calendar/CalendarPageClient";
import { ConnectionsPageClient } from "@/features/dashboard/connections/ConnectionsPageClient";
import { SettingsPageClient } from "@/pages/SettingsPage";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export function DashboardIndexPage() {
  return <Navigate to="/dashboard/composer" replace />;
}

export function PostsPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading posts..." />}>
      <PostsPageClient />
    </Suspense>
  );
}

export function BillingPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading billing..." />}>
      <BillingPageClient />
    </Suspense>
  );
}

export function CalendarPage() {
  return <CalendarPageClient />;
}

export function ConnectionsPage() {
  return <ConnectionsPageClient />;
}

export function SettingsPage() {
  return <SettingsPageClient />;
}
