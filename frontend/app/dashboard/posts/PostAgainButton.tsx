"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { postAgain } from "@/app/actions/posts";
import { getPostPublicationList } from "@/app/actions/publish";
import { Repeat } from "lucide-react";
import {
  UploadPublishOverlay,
  type PlatformResult,
} from "@/components/UploadPublishOverlay";
import {
  mergePublicationProgressIntoPlatformStatuses,
  pollPublicationProgressUntilDone,
  publicationRowsToPlatformStatuses,
  sortBySlowPlatformsLast,
} from "@/lib/publish-order";
import { toast } from "sonner";

type OverlayPhase = "idle" | "publishing" | "done";

export function PostAgainButton({
  postId,
  label = "Post again",
  variant = "button",
  onStarted,
  onFinished,
}: {
  postId: string;
  label?: string;
  /** button: detail page; compact: small inline; menu: posts list quick action */
  variant?: "button" | "compact" | "menu";
  onStarted?: () => void;
  onFinished?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [platformStatuses, setPlatformStatuses] = useState<PlatformResult[]>(
    [],
  );
  const dismissedRef = useRef(false);

  const dismissOverlay = () => {
    dismissedRef.current = true;
    setOverlayPhase("idle");
    setPublishedPostId(null);
    setPlatformStatuses([]);
    setLoading(false);
  };

  const handleClick = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    toast.dismiss();
    dismissedRef.current = false;
    setLoading(true);
    setOverlayPhase("publishing");
    setPlatformStatuses([]);
    setPublishedPostId(null);
    onStarted?.();

    const result = await postAgain(postId);
    if (!result.success) {
      toast.error(result.error);
      setLoading(false);
      setOverlayPhase("idle");
      onFinished?.();
      return;
    }

    const newPostId = result.newPostId;
    setPublishedPostId(newPostId);

    let list: Awaited<ReturnType<typeof getPostPublicationList>> = [];
    try {
      list = await getPostPublicationList(newPostId);
    } catch {
      // proceed with empty list; polling may still pick up rows
    }

    if (list.length > 0) {
      const ordered = sortBySlowPlatformsLast(list);
      setPlatformStatuses(publicationRowsToPlatformStatuses(ordered));
      await pollPublicationProgressUntilDone(newPostId, (rows) => {
        setPlatformStatuses((prev) =>
          prev.length > 0
            ? mergePublicationProgressIntoPlatformStatuses(prev, rows)
            : publicationRowsToPlatformStatuses(rows),
        );
      });
    } else {
      await pollPublicationProgressUntilDone(newPostId, (rows) => {
        if (rows.length === 0) return;
        setPlatformStatuses((prev) =>
          prev.length > 0
            ? mergePublicationProgressIntoPlatformStatuses(prev, rows)
            : publicationRowsToPlatformStatuses(rows),
        );
      });
    }

    setLoading(false);
    if (dismissedRef.current) {
      dismissedRef.current = false;
      onFinished?.();
      return;
    }
    setOverlayPhase("done");
    router.refresh();
    onFinished?.();
  };

  const showOverlay = overlayPhase !== "idle";
  const allDone =
    platformStatuses.length > 0 &&
    platformStatuses.every(
      (p) => p.status === "published" || p.status === "failed",
    );

  const overlay = showOverlay ? (
    <UploadPublishOverlay
      phase="publishing"
      showLinks={overlayPhase === "done" && platformStatuses.length === 0}
      publishedPostId={publishedPostId}
      platformStatuses={platformStatuses}
      allDone={overlayPhase === "done" || allDone}
      onDismiss={overlayPhase === "publishing" ? dismissOverlay : undefined}
      onClose={dismissOverlay}
    />
  ) : null;

  if (variant === "menu") {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="block w-full rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-60"
        >
          {loading ? "Posting…" : label}
        </button>
        {overlay}
      </>
    );
  }

  if (variant === "compact") {
    return (
      <>
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
        </div>
        {overlay}
      </>
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
      </div>
      {overlay}
    </>
  );
}
