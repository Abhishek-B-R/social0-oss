import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type SidebarHoverTipProps = {
  label: string;
  /** Only show tip when sidebar is collapsed (and fine pointer). */
  enabled: boolean;
  children: ReactNode;
  className?: string;
};

/** Shared rail tip state — first tip waits ~80ms; neighbors open instantly. */
let railTipOpen = false;
let railTipCloseTimer: number | null = null;

function markRailTipOpen() {
  railTipOpen = true;
  if (railTipCloseTimer != null) {
    window.clearTimeout(railTipCloseTimer);
    railTipCloseTimer = null;
  }
}

function markRailTipClosedSoon() {
  if (railTipCloseTimer != null) window.clearTimeout(railTipCloseTimer);
  railTipCloseTimer = window.setTimeout(() => {
    railTipOpen = false;
    railTipCloseTimer = null;
  }, 180);
}

/**
 * Near-instant label tip for the collapsed icon rail.
 * First tip: ~80ms. Subsequent tips while skimming: instant (Emil / Sonner pattern).
 */
export function SidebarHoverTip({
  label,
  enabled,
  children,
  className,
}: SidebarHoverTipProps) {
  const tipId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [finePointer, setFinePointer] = useState(false);
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const clearTimer = () => {
    if (showTimer.current != null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  };

  const place = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.top + r.height / 2,
      left: r.right + 10,
    });
  }, []);

  const onEnter = () => {
    if (!enabled || !finePointer) return;
    clearTimer();
    const skipDelay = railTipOpen;
    setInstant(skipDelay);
    const delay = skipDelay ? 0 : 80;
    showTimer.current = window.setTimeout(() => {
      place();
      markRailTipOpen();
      setOpen(true);
    }, delay);
  };

  const onLeave = () => {
    clearTimer();
    setOpen(false);
    markRailTipClosedSoon();
  };

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {children}
      {open && finePointer
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              className={cn(
                "pointer-events-none fixed z-[80] -translate-y-1/2 rounded-lg border border-sidebar-menu-border bg-sidebar-menu-bg px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap text-sidebar-text shadow-[0_8px_24px_-8px_rgba(0,0,0,0.55)]",
                !instant &&
                  "transition-[opacity,transform] duration-125 ease-[cubic-bezier(0.23,1,0.32,1)]",
              )}
              style={{
                top: pos.top,
                left: pos.left,
                opacity: 1,
                transform: "translateY(-50%)",
              }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
