import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { PostDetailView } from "@/features/dashboard/posts/PostDetailView";
import { PostDetailPageSkeleton } from "@/components/ui/page-skeletons";

export function PostDetailPage() {
  const { id = "" } = useParams();
  return (
    <Suspense fallback={<PostDetailPageSkeleton />}>
      <PostDetailView postId={id} />
    </Suspense>
  );
}
