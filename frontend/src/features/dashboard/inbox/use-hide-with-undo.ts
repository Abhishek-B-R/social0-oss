import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  hideInboxComment,
  hideInboxCommentOnUnload,
  type InboxComment,
} from "@/api/inbox";
import { PLATFORM_LABEL } from "@/lib/platforms";

/** How long Undo stays available before the hide is sent to the network. */
const HIDE_UNDO_MS = 5000;

type PendingHide = {
  timer: ReturnType<typeof setTimeout>;
  /** Send now and report the result in the UI (timer or in-app navigation). */
  commit: () => void;
  /** Send with `keepalive` because the tab is closing or reloading. */
  flushOnUnload: () => void;
};

/**
 * Hiding a comment is a one-way platform call (Instagram / Facebook have no
 * unhide through Social0), so Undo works by waiting: the comment disappears
 * here at once and the request goes out after a few seconds unless undone.
 * Leaving the page (in-app navigation, reload or closing the tab) sends
 * anything still waiting.
 */
export function useHideWithUndo() {
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const pending = useRef(new Map<string, PendingHide>());

  const restore = useCallback((id: string) => {
    setHiddenIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const hide = useCallback(
    (comment: InboxComment) => {
      const id = comment.id;
      if (pending.current.has(id)) return;
      const network = PLATFORM_LABEL[comment.platform] ?? comment.platform;
      setHiddenIds((prev) => new Set(prev).add(id));

      // Sonner pauses its dismiss timer on hover and while the tab is hidden,
      // so the toast can outlive the undo window. Close it when the request
      // goes out so Undo is never offered for a hide that already happened.
      const toastId = `inbox-hide-${id}`;

      const commit = () => {
        const entry = pending.current.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.current.delete(id);
        toast.dismiss(toastId);
        void hideInboxComment({ publicationId: comment.publicationId, commentId: id })
          .then((res) => {
            if (!res.ok) {
              restore(id);
              toast.error(`Couldn't hide the comment on ${network}: ${res.error}`);
            }
          })
          .catch((e: unknown) => {
            restore(id);
            toast.error(
              e instanceof Error
                ? `Couldn't hide the comment on ${network}: ${e.message}`
                : `Couldn't hide the comment on ${network}. Try again.`,
            );
          });
      };

      const flushOnUnload = () => {
        const entry = pending.current.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.current.delete(id);
        toast.dismiss(toastId);
        hideInboxCommentOnUnload({ publicationId: comment.publicationId, commentId: id });
      };

      pending.current.set(id, {
        timer: setTimeout(commit, HIDE_UNDO_MS),
        commit,
        flushOnUnload,
      });

      toast(`Comment hidden on ${network}`, {
        id: toastId,
        description: "Other people won't see it.",
        duration: HIDE_UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            const entry = pending.current.get(id);
            if (!entry) {
              // The hide already went out; there's no unhide through Social0.
              toast.error(`Already hidden on ${network}. Unhide it there.`);
              return;
            }
            clearTimeout(entry.timer);
            pending.current.delete(id);
            restore(id);
          },
        },
      });
    },
    [restore],
  );

  useEffect(() => {
    const map = pending.current;
    // Reload / tab close: a normal fetch would be cancelled with the page,
    // so send what's still waiting with keepalive.
    const onPageHide = () => {
      for (const entry of [...map.values()]) entry.flushOnUnload();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      // Navigating away inside the app: send what's still waiting.
      for (const entry of [...map.values()]) entry.commit();
    };
  }, []);

  return { hiddenIds, hide };
}
