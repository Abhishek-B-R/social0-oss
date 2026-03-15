"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAgain } from "@/app/actions/posts";
import { Repeat } from "lucide-react";
import { UploadPublishOverlay } from "@/components/UploadPublishOverlay";

type OverlayPhase = "idle" | "publishing" | "done";

export function PostAgainButton({
  postId,
  label = "Post again",
  compact,
}: {
  postId: string;
  label?: string;
  /** Smaller styling for list cards */
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);

  const handleClick = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setError(null);
    setLoading(true);
    setOverlayPhase("publishing");
    const result = await postAgain(postId);
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      setOverlayPhase("idle");
      return;
    }
    router.refresh();
    if (result.newPostId) {
      setPublishedPostId(result.newPostId);
      setOverlayPhase("done");
    } else {
      setOverlayPhase("idle");
    }
  };

  const showOverlay = overlayPhase !== "idle" && !compact;

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-bg-subtle transition-colors disabled:opacity-50"
        >
          <Repeat className="h-3 w-3" />
          {loading ? "Posting…" : label}
        </button>
        {error && (
          <p
            className="text-[10px] text-red-600 dark:text-red-400 text-right truncate max-w-full"
            title={error}
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => handleClick()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle transition-colors disabled:opacity-50"
        >
          <Repeat className="h-4 w-4" />
          {loading ? "Posting…" : label}
        </button>
        {error && (
          <p
            className="text-xs text-red-600 dark:text-red-400 max-w-[280px] text-right"
            title={error}
          >
            {error}
          </p>
        )}
      </div>
      {showOverlay && (
        <UploadPublishOverlay
          phase="publishing"
          showLinks={overlayPhase === "done"}
          publishedPostId={publishedPostId}
          onClose={() => {
            setOverlayPhase("idle");
            setPublishedPostId(null);
            if (publishedPostId) {
              router.push(`/dashboard/posts/${publishedPostId}`);
            }
            router.refresh();
          }}
        />
      )}
    </>
  );
}
