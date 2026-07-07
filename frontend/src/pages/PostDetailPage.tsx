import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { PostDetailView } from "@/features/dashboard/posts/PostDetailView";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export function PostDetailPage() {
  const { id = "" } = useParams();
  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading post..." />}>
      <PostDetailView postId={id} />
    </Suspense>
  );
}
