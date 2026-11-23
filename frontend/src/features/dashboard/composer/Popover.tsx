import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

import { trackPopoverOpen } from "./popover-state";

type PopoverProps = {
  open: boolean;
  onClose: () => void;
  /** Element the panel lines up with. */
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  children: ReactNode;
  /** Prefer opening above the anchor (footer buttons). */
  side?: "top" | "bottom";
  align?: "start" | "end";
  width?: number;
  className?: string;
  /** Element to focus on open (defaults to the first focusable). */
  initialFocusRef?: RefObject<HTMLElement | null>;
};

const MOBILE_QUERY = "(max-width: 639px)";

/**
 * Small anchored panel for composer settings and the schedule picker.
 * Rendered in place (not portaled) so it stays inside the composer
 * dialog's focus scope; positioned `fixed` from the anchor so scroll
 * containers can't clip it. Phones get a bottom sheet instead.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  title,
  children,
  side = "bottom",
  align = "start",
  width = 360,
  className,
  initialFocusRef,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
  );

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Stay inside the composer's editor area when there is one, so a panel
    // never hangs over the footer buttons or past the card's edge.
    const box = anchor.closest("[data-popover-boundary]")?.getBoundingClientRect();
    const boundTop = Math.max(0, box?.top ?? 0);
    const boundBottom = Math.min(vh, box?.bottom ?? vh);
    const w = Math.min(width, vw - 16);
    let left = align === "end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    const below = boundBottom - r.bottom - 12;
    const above = r.top - boundTop - 12;
    const useTop = side === "top" ? above > 220 || above > below : below < 260 && above > below;
    if (useTop) {
      const maxH = Math.max(160, above - 8);
      const h = panelRef.current?.offsetHeight ?? 0;
      setPos({ top: Math.max(boundTop + 8, r.top - 8 - Math.min(h, maxH)), left, maxH });
    } else {
      setPos({ top: r.bottom + 8, left, maxH: Math.max(160, below - 8) });
    }
  }, [anchorRef, align, side, width]);

  useEffect(() => {
    if (!open) return;
    return trackPopoverOpen();
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useLayoutEffect(() => {
    if (!open || mobile) return;
    place();
    // Second pass once the panel has a height (for "top" placement).
    const id = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, mobile, place]);

  // Focus in, Esc / outside click closes, focus goes back to the anchor.
  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const t = setTimeout(() => {
      const target =
        initialFocusRef?.current ??
        panelRef.current?.querySelector<HTMLElement>(
          "input:not([type=hidden]),textarea,select,button:not([data-popover-close]),[href],[tabindex]:not([tabindex='-1'])",
        );
      target?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchor?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const el = e.target as Node;
      if (panelRef.current?.contains(el) || anchor?.contains(el)) return;
      // Clicks inside another dialog layered on top (auto-plug settings)
      // don't count; clicks elsewhere in the composer dialog do.
      const dlg = el instanceof Element ? el.closest("[role='dialog']") : null;
      if (dlg && panelRef.current && !dlg.contains(panelRef.current)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, onClose, anchorRef, initialFocusRef]);

  if (!open) return null;

  if (mobile) {
    return (
      <>
        <div className="fixed inset-0 z-[60] bg-scrim" aria-hidden onClick={onClose} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={title}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[61] flex max-h-[80dvh] flex-col rounded-t-2xl border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] text-text shadow-2xl",
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">{title}</p>
            <button
              type="button"
              data-popover-close
              onClick={onClose}
              aria-label="Close"
              className="inline-flex size-11 items-center justify-center rounded-lg text-text-muted hover:bg-bg-muted"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        </div>
      </>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: Math.min(width, typeof window !== "undefined" ? window.innerWidth - 16 : width),
        maxHeight: pos?.maxH,
      }}
      className={cn(
        "fixed z-[61] flex flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated text-text shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{children}</div>
    </div>
  );
}
