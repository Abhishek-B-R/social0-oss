import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { createPost } from "@/api/posts";
import { loadPostDetailCoreData } from "@/api/dashboard-data";
import { useDashboardPath } from "@/components/app";
import { metadataForCopy } from "@/features/dashboard/posts/posts-model";

/**
 * "Share on other networks" for a post that did well: copy it into a draft
 * aimed at accounts it never went to, then open that draft in the composer so
 * the person reviews it (captions, network rules) before anything goes out.
 * Never republishes to the networks it already ran on.
 */
export function useShareElsewhere(): {
  run: (postId: string, accountIds: string[]) => Promise<void>;
  busy: boolean;
} {
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (postId: string, accountIds: string[]) => {
      if (accountIds.length === 0) return;
      setBusy(true);
      try {
        const res = await loadPostDetailCoreData(postId);
        if (!res.ok) {
          toast.error("Couldn't open that post. Try again.");
          return;
        }
        const post = res.data.post;
        const created = await createPost(
          post.originalContent ?? "",
          accountIds,
          "draft",
          null,
          post.mediaIds ?? [],
          metadataForCopy(post.metadata ?? null),
        );
        if (!created.success) {
          toast.error(created.error);
          return;
        }
        navigate(dash(`new?draft=${created.postId}`));
      } catch {
        toast.error("Couldn't copy that post. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [dash, navigate],
  );

  return { run, busy };
}
