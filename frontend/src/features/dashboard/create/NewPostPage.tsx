import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { readComposerSearchParams, registerPageComposer, useDashboardPath } from "@/components/app";
import { Composer } from "@/features/dashboard/composer/Composer";
import { pendingRestoreVersion } from "@/features/dashboard/composer/autosave";
import type { ComposerMode } from "@/features/dashboard/composer/types";

/** `?draft=` / `?scheduled=` / `?edit=` → composer mode (old create routes). */
function modeFromSearch(params: URLSearchParams): ComposerMode {
  const draft = params.get("draft");
  if (draft) return { kind: "draft", postId: draft };
  const scheduled = params.get("scheduled");
  if (scheduled) return { kind: "scheduled", postId: scheduled };
  const edit = params.get("edit");
  if (edit) return { kind: "edit", postId: edit };
  return { kind: "new" };
}

/**
 * Full-page composer at `/dashboard/new` (and team scope). Also rendered
 * for the old `/composer`, `/create` and `/create/:type` routes, with
 * `?edit=`, `?draft=`, `?scheduled=` and the `/new` prefill params
 * (`?text=&at=&accounts=&intent=`).
 */
export function NewPostPage({ startAsThread = false }: { startAsThread?: boolean } = {}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const mode = useMemo(() => modeFromSearch(params), [params]);
  const prefill = useMemo(() => readComposerSearchParams(params), [params]);
  const modeKey = mode.kind === "new" ? "new" : `${mode.kind}:${mode.postId}`;
  // While this page is up, openComposer() (sidebar, palette, C) won't stack
  // a second composer on the same autosaved draft.
  useEffect(() => registerPageComposer(), []);

  const onDone = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(dash(), { replace: true });
  }, [navigate, dash]);

  return (
    <Composer
      // A new mode / post id, or a hand-off ("Open full page", "Back to
      // composer"), starts a fresh composer.
      key={`${modeKey}:${pendingRestoreVersion()}`}
      variant="page"
      mode={mode}
      prefill={prefill}
      startAsThread={startAsThread}
      onDone={onDone}
    />
  );
}

export default NewPostPage;
