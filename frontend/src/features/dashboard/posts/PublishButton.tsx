
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { usePostHog } from "@posthog/react";
import { capturePostAction } from "@/lib/posthog-events";
import { useState } from "react";
import { publishPost } from "@/api/publish";
import {
  pollPublicationProgressUntilDone,
  type PublicationProgressRow,
} from "@/lib/publish-order";
import { toast } from "sonner";

function toastFromCounts(published: number, failed: number, emptyHint?: string) {
  if (published + failed === 0) {
    toast.message("Publish finished", {
      description: emptyHint ?? "Refreshing post status…",
    });
    return;
  }
  if (failed === 0) {
    toast.success(
      published <= 1 ? "Post published" : "Published to all platforms",
    );
    return;
  }
  if (published === 0) {
    toast.error("Publish failed. Check the log below.");
    return;
  }
  toast.warning("Partially published", {
    description: `${published} succeeded, ${failed} failed.`,
  });
}

export function PublishButton({
  postId,
  publicationId,
  disabled,
  label = "Publish now",
  onStarted,
  onFinished,
}: {
  postId: string;
  /** When set, only this publication is retried (per-platform Retry). */
  publicationId?: string;
  disabled?: boolean;
  label?: string;
  /** Fired once publish work is underway (so the page can show Publishing…). */
  onStarted?: () => void;
  /** Fired after publish settles (or fails to start) so the page can refresh. */
  onFinished?: () => void;
}) {
  const invalidateQueries = useInvalidateQueries();
  const posthog = usePostHog();
  const [loading, setLoading] = useState(false);

  const handlePublish = async () => {
    toast.dismiss();
    setLoading(true);
    onStarted?.();

    try {
      const result = await publishPost(postId, undefined, publicationId);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.success && result.results.some((r) => r.error)) {
        toast.error(
          result.results.find((r) => r.error)?.error ?? "Publish failed",
        );
        return;
      }

      let published = result.results.filter((r) => r.status === "published")
        .length;
      let failed = result.results.filter((r) => r.status === "failed").length;

      // CF / slow paths may return before rows settle — poll as a safety net.
      if (result.results.length === 0) {
        let rows: PublicationProgressRow[] = [];
        await pollPublicationProgressUntilDone(postId, (next) => {
          rows = next;
        });
        published = rows.filter((r) => r.publicationStatus === "published")
          .length;
        failed = rows.filter((r) => r.publicationStatus === "failed").length;
      }

      toastFromCounts(published, failed);
      capturePostAction(posthog, "post_published", {
        source: publicationId ? "retry_publication" : "publish_button",
        platform_count: published + failed || result.results?.length || 0,
      });
      invalidateQueries();
    } finally {
      setLoading(false);
      onFinished?.();
    }
  };

  const loadingLabel = /retry/i.test(label) ? "Retrying…" : "Publishing…";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handlePublish()}
        disabled={disabled || loading}
        className="rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-foreground px-3 py-1.5 text-sm font-medium transition-colors"
      >
        {loading ? loadingLabel : label}
      </button>
    </div>
  );
}
