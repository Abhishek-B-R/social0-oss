import { useEffect, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useDashboardPath, type ComposerModalProps } from "@/components/app";
import { Composer } from "@/features/dashboard/composer/Composer";
import { composerPopoverOpen } from "@/features/dashboard/composer/popover-state";
import { setPendingRestore } from "@/features/dashboard/composer/autosave";

const NEW_MODE = { kind: "new" } as const;

/**
 * The composer as a modal, opened from anywhere with `openComposer()`
 * (C, the sidebar compose icon, Home quick-compose, the command palette,
 * calendar empty slots). Mounted by `ComposerHost` in the dashboard layout.
 * Publishes report in the PublishTray, which the layout mounts.
 */
export function ComposerModal({ open, options, nonce, onClose }: ComposerModalProps) {
  const navigate = useNavigate();
  const dash = useDashboardPath();
  useCloseOnNavigation(open, nonce, onClose);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            // Esc closes an open popover first, not the whole composer.
            if (composerPopoverOpen()) e.preventDefault();
          }}
          // Clicking the backdrop closes the composer (writing is autosaved).
          // A click while a settings popover is open only closes the popover,
          // and clicks on toasts never count as "outside".
          onPointerDownOutside={(e) => {
            const target = e.target instanceof Element ? e.target : null;
            if (composerPopoverOpen() || target?.closest("[data-sonner-toaster]")) {
              e.preventDefault();
            }
          }}
          onFocusOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg-elevated text-text shadow-2xl outline-none sm:inset-6 sm:rounded-2xl sm:border sm:border-border lg:inset-y-10 lg:left-[max(1.5rem,calc(50vw-36rem))] lg:right-[max(1.5rem,calc(50vw-36rem))]"
        >
          <DialogPrimitive.Title className="sr-only">New post</DialogPrimitive.Title>
          {open ? (
            <Composer
              key={nonce}
              variant="modal"
              mode={NEW_MODE}
              prefill={options}
              onDone={onClose}
              onClose={onClose}
              onExpand={(draft, slots) => {
                setPendingRestore(draft, slots);
                onClose();
                navigate(dash("new"));
              }}
            />
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The modal's open state lives in composer-bus, not in the route, so a link
 * inside it (Connect account, Set up a posting schedule, billing, …) would
 * change the page underneath while the full-screen modal stays on top.
 * Close it when the user navigates; the draft is autosaved and flushed on
 * unmount. A same-path `replace` is the page underneath tidying its own query
 * string (notice cleanup, filter sync), not the user leaving, so it is ignored.
 */
function useCloseOnNavigation(open: boolean, nonce: number, onClose: () => void) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const origin = useRef<{ nonce: number; key: string; pathname: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const at = origin.current;
    if (!at || at.nonce !== nonce) {
      // A new open: remember where it happened.
      origin.current = { nonce, key: location.key, pathname: location.pathname };
      return;
    }
    if (location.key === at.key) return;
    if (navigationType === "REPLACE" && location.pathname === at.pathname) {
      origin.current = { ...at, key: location.key };
      return;
    }
    onClose();
  }, [open, nonce, location.key, location.pathname, navigationType, onClose]);
}

export default ComposerModal;
