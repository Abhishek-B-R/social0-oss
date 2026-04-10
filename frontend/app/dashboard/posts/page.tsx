import { Suspense } from "react";
import { PostsPageClient } from "./PostsPageClient";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export default function PostsPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <PostsPageClient />
    </Suspense>
  );
}
