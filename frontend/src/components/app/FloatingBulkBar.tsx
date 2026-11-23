import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type FloatingBulkBarProps = {
  /** Number of selected rows; the bar hides at 0. */
  count: number;
  onClear: () => void;
  /** Action buttons. Use `BulkBarButton`. */
  children: ReactNode;
  /** Noun for the count, e.g. "post" → "3 posts selected". */
  noun?: string;
  className?: string;
};

/** Space between the bar's top edge and anything stacked above it. */
const STACK_GAP_PX = 12;
/**
 * Height the bar occupies (plus a gap) while it is open, 0px otherwise.
 * Other bottom overlays (the publish tray) add it to their offset so they
 * stack above the bar instead of covering it. Default lives in index.css.
 */
const CLEARANCE_VAR = "--bulk-bar-clearance";

/**
 * Bottom-centred action bar for row selections. Sits above the mobile tab
 * bar, Esc clears the selection. While open it publishes its height as
 * `--bulk-bar-clearance` so the publish tray moves up out of its way.
 */
export function FloatingBulkBar({
  count,
  onClear,
  children,
  noun = "item",
  className,
}: FloatingBulkBarProps) {
  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Leave Esc to open dialogs/menus.
      if (document.querySelector("[role='dialog'][data-state='open']")) return;
      onClear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClear]);

  const barRef = useRef<HTMLDivElement>(null);
  const open = count > 0;
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!open || !el) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty(CLEARANCE_VAR, `${el.offsetHeight + STACK_GAP_PX}px`);
    publish();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty(CLEARANCE_VAR);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={`${count} selected`}
      className={cn(
        "s0-bulk-bar fixed left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-bg-elevated p-1.5 pl-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)]",
        "bottom-[calc(var(--bottom-nav-total)+0.75rem)] lg:bottom-6",
        className,
      )}
    >
      <span className="whitespace-nowrap pr-2 text-sm font-medium text-text" aria-live="polite">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {children}
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-1 inline-flex size-8 touch:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Compact button for the bulk bar. `tone="danger"` for Delete. */
export function BulkBarButton({
  children,
  onClick,
  disabled,
  tone = "default",
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 touch:h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        tone === "primary" && "bg-accent text-accent-foreground hover:bg-accent-hover",
        tone === "danger" && "text-danger hover:bg-danger-soft",
        tone === "default" && "text-text hover:bg-bg-muted",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
