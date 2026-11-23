import { useCallback, useState } from "react";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { capturePostAction } from "@/lib/posthog-events";
import { useDashboardBasePath } from "@/lib/dashboard-base-path";
import { postAgain } from "@/api/posts";
import { getPostPublicationList } from "@/api/publish";
import { sortBySlowPlatformsLast } from "@/lib/publish-order";
import { localId } from "@/features/dashboard/composer/media-intake";
import { addTrayJob, type TrayRow } from "@/features/dashboard/publish/publish-store";
import { trackPublish } from "@/features/dashboard/publish/track-publish";

function trayTitle(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "Post again";
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/**
 * "Post again": clone a published post and publish it now. Progress goes to
 * the PublishTray (same as the composer), so nothing blocks the page and
 * menus can close right away. `loadingId` covers only the clone request.
 */
export function usePostAgain(source: string = "post_detail"): {
  run: (postId: string, opts?: { title?: string | null }) => Promise<void>;
  loadingId: string | null;
} {
  const invalidateQueries = useInvalidateQueries();
  const posthog = usePostHog();
  const basePath = useDashboardBasePath();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const run = useCallback(
    async (postId: string, opts?: { title?: string | null }) => {
      setLoadingId(postId);
      let result: Awaited<ReturnType<typeof postAgain>>;
      try {
        result = await postAgain(postId);
      } catch (e) {
        result = {
          success: false,
          error: e instanceof Error && e.message ? e.message : "Couldn't post again. Try again.",
        };
      }
      if (!result.success) {
        setLoadingId(null);
        toast.error(result.error);
        return;
      }

      const newPostId = result.newPostId;
      let rows: TrayRow[] = [];
      try {
        const list = await getPostPublicationList(newPostId);
        rows = sortBySlowPlatformsLast(list).map((r) => ({
          accountId: r.connectedAccountId,
          platform: r.platform,
          handle: r.platformUsername ? `@${r.platformUsername}` : r.platform,
          status: "waiting",
          publicationId: r.publicationId,
        }));
      } catch {
        // The tray fills the rows in from its own polling.
      }

      const jobId = localId("job");
      addTrayJob({
        id: jobId,
        title: trayTitle(opts?.title),
        kind: "now",
        phase: "publishing",
        uploadPercent: null,
        postId: newPostId,
        rows,
        createdAt: Date.now(),
        basePath,
      });
      setLoadingId(null);
      invalidateQueries();

      await trackPublish({ jobId, postId: newPostId, streamUrl: result.streamUrl ?? null });
      invalidateQueries();
      capturePostAction(posthog, "post_again_completed", { source });
    },
    [basePath, invalidateQueries, posthog, source],
  );

  return { run, loadingId };
}
