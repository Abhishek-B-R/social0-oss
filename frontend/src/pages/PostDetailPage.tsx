import { useParams } from "react-router-dom";
import { PostDetailView } from "@/features/dashboard/posts/PostDetailView";

/** /posts/:id (and team scope). Keyed so each post starts with fresh state. */
export function PostDetailPage() {
  const { id = "" } = useParams();
  return <PostDetailView key={id} postId={id} />;
}
