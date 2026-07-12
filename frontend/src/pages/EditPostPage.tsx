import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { EditPostWithAccounts } from "@/features/dashboard/posts/EditPostWithAccounts";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import type { DateFormatKey } from "@social0/shared/browser";

export function EditPostPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ["edit-post", id],
    queryFn: () =>
      rpc<{
        ok: boolean;
        post?: {
          id: string;
          originalContent: string | null;
          status: string | null;
          scheduledAt: Date | null;
          mediaIds: string[] | null;
          connectedAccountIds: string[];
        };
        existingMedia?: Array<{
          id: string;
          originalFilename: string;
          mimeType: string;
          url: string | null;
          thumbnailUrl: string | null;
        }>;
        use24HourTimeFormat?: boolean;
        dateFormat?: string | null;
        error?: string;
      }>("posts.loadEditPostPageData", id),
    enabled: !!session && !!id,
  });

  useEffect(() => {
    if (!isPending && !session) {
      navigate(signInUrl(`/dashboard/posts/${id}/edit`), { replace: true });
    }
  }, [isPending, session, navigate, id]);

  useEffect(() => {
    if (data && !data.ok) navigate("/dashboard/posts", { replace: true });
  }, [data, navigate]);

  if (isLoading || !data?.ok || !data.post) return null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Link
          to="/dashboard/posts"
          className="text-sm font-medium text-text-muted hover:text-text transition-colors"
        >
          ← Back to Posts
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm font-medium text-text">Edit post</span>
      </div>
      <h2 className="text-2xl font-extrabold text-text mb-2">Edit post</h2>
      <p className="text-gray-500 mb-8 font-medium">
        Update content, accounts, or scheduled time.
      </p>
      <EditPostWithAccounts
        post={data.post}
        existingMedia={data.existingMedia ?? []}
        use24HourTimeFormat={data.use24HourTimeFormat ?? false}
        dateFormat={(data.dateFormat ?? "dd/MM/yyyy") as DateFormatKey}
      />
    </div>
  );
}
