import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { PostDetailView } from "@/features/dashboard/posts/PostDetailView";
import { PostAdjacentNav } from "@/features/dashboard/posts/PostAdjacentNav";
import { PostDetailPageSkeleton } from "@/components/ui/page-skeletons";

export function PostDetailPage() {
  const { id = "" } = useParams();
  return (
    <>
      <PostAdjacentNav postId={id} />
      <Suspense fallback={<PostDetailPageSkeleton />}>
        <PostDetailView key={id} postId={id} />
      </Suspense>
    </>
  );
}
