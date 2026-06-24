import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { PostDetailPageClient } from "@/features/dashboard/posts/PostDetailPageClient";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export function PostDetailPage() {
  const { id = "" } = useParams();
  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading post..." />}>
      <PostDetailPageClient postId={id} />
    </Suspense>
  );
}
