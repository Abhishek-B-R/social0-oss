import { Suspense } from "react";
import { PostDetailPageClient } from "./PostDetailPageClient";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading post..." />}>
      <PostDetailPageClient postId={id} />
    </Suspense>
  );
}
