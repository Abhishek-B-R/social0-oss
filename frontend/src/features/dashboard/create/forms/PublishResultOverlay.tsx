import { useNavigate } from "react-router-dom";
import {
  UploadPublishOverlay,
  type PlatformResult,
} from "@/components/UploadPublishOverlay";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";

/** Superset of the five forms' local phase unions — the text form has no upload step. */
export type FormOverlayPhase =
  | "idle"
  | "uploading"
  | "publishing"
  | "saving"
  | "done";

/**
 * The publish/upload overlay as every post form drives it.
 *
 * Each form rendered its own 48-line copy of this, differing only in the upload
 * props at the top — everything from `isScheduling` down, the close handler
 * included, was identical. Those upload props stay per-form; the rest is here.
 */
export function PublishResultOverlay(props: {
  overlayPhase: FormOverlayPhase;
  isScheduling: boolean;
  draftSavedPostId: string | null;
  scheduledPostId: string | null;
  publishedPostId: string | null;
  selectedAccounts: readonly { platform: string }[];
  resurfaceConfig: AutoResurfaceConfig | null;
  platformStatuses: PlatformResult[];
  setScheduledPostId: (id: string | null) => void;
  setDraftSavedPostId: (id: string | null) => void;
  setOverlayPhase: (phase: "idle") => void;
  /** Upload-phase props, for the forms that have one. */
  uploadProgress?: string | null;
  uploadPercent?: number | null;
  showUploadWarning?: boolean;
  onCancelUpload?: () => void;
  mediaType?: "image" | "video" | "mixed";
}) {
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const invalidateQueries = useInvalidateQueries();

  if (props.overlayPhase === "idle") return null;

  const { platformStatuses, publishedPostId, scheduledPostId } = props;
  const draftSavedPostId = props.draftSavedPostId;
  const done = props.overlayPhase === "done";

  return (
    <UploadPublishOverlay
      phase={
        props.overlayPhase === "uploading"
          ? "uploading"
          : props.overlayPhase === "saving"
            ? "saving"
            : "publishing"
      }
      uploadProgress={props.uploadProgress}
      uploadPercent={props.uploadPercent}
      showUploadWarning={props.showUploadWarning}
      onCancelUpload={props.onCancelUpload}
      mediaType={props.mediaType}
      isScheduling={props.isScheduling}
      showLinks={done}
      draftSuccess={!!draftSavedPostId}
      draftPostId={draftSavedPostId}
      scheduleSuccess={!!scheduledPostId}
      publishedPostId={scheduledPostId ?? publishedPostId}
      publishedToX={props.selectedAccounts.some(
        (a) => a.platform === "twitter_x",
      )}
      resurfacePreFill={
        done && props.resurfaceConfig && !scheduledPostId && !draftSavedPostId
          ? {
              intervalHours: props.resurfaceConfig.intervalHours,
              maxResurfaces: props.resurfaceConfig.maxResurfaces,
              plugComment: props.resurfaceConfig.plugComment ?? "",
            }
          : null
      }
      platformStatuses={platformStatuses}
      allDone={
        platformStatuses.length > 0 &&
        platformStatuses.every(
          (p) => p.status === "published" || p.status === "failed",
        )
      }
      onClose={() => {
        const allFailed =
          platformStatuses.length > 0 &&
          platformStatuses.every((p) => p.status === "failed");
        if (allFailed && publishedPostId) {
          navigate(dash(`posts/${publishedPostId}`), { replace: true });
          invalidateQueries();
        } else {
          props.setScheduledPostId(null);
          props.setDraftSavedPostId(null);
          props.setOverlayPhase("idle");
        }
      }}
    />
  );
}
