import { forwardRef, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Kbd } from "@/components/app";
import { cn } from "@/lib/utils";
import { Popover } from "./Popover";

export type SplitMenuItem = {
  key: string;
  label: string;
  hint?: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  tone?: "default" | "danger";
};

type Props = {
  label: ReactNode;
  onPrimary: () => void;
  menu: SplitMenuItem[];
  disabled?: boolean;
  disabledReason?: string | null;
  busy?: boolean;
  /** Amber look when the click will show issues first. */
  warn?: boolean;
  /** Tooltip for the primary button (carries the keyboard shortcut). */
  title?: string;
};

/**
 * Primary action with a caret menu. The wrapper is the anchor for the
 * schedule and issues popovers.
 */
export const SplitButton = forwardRef<HTMLDivElement, Props>(function SplitButton(
  { label, onPrimary, menu, disabled, disabledReason, busy, warn, title },
  ref,
) {
  const [open, setOpen] = useState(false);
  const caretRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const focusItem = (dir: 1 | -1) => {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not([disabled])") ?? [],
    );
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + dir + items.length) % items.length]?.focus();
  };

  return (
    <div ref={ref} className="flex min-w-0 max-w-full rounded-xl shadow-sm">
      <button
        type="button"
        onClick={onPrimary}
        disabled={disabled || busy}
        title={disabled ? (disabledReason ?? undefined) : title}
        className={cn(
          "inline-flex h-9 min-w-0 items-center gap-1.5 rounded-l-xl px-3.5 text-sm font-semibold transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 touch:h-11",
          warn
            ? "bg-warning-solid text-warning-solid-foreground hover:brightness-105"
            : "bg-accent text-accent-foreground hover:bg-accent-hover",
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </button>
      <button
        ref={caretRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More publish options"
        disabled={busy}
        className={cn(
          "inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-r-xl border-l transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1 disabled:opacity-50 touch:h-11 touch:w-10",
          warn
            ? "border-warning-solid-foreground/20 bg-warning-solid text-warning-solid-foreground hover:brightness-105"
            : "border-accent-foreground/20 bg-accent text-accent-foreground hover:bg-accent-hover",
        )}
      >
        <ChevronDown className="size-4" aria-hidden />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={caretRef}
        title="Publish options"
        side="top"
        align="end"
        width={280}
      >
        <div
          ref={listRef}
          role="menu"
          aria-label="Publish options"
          className="-m-1.5 py-0.5"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              focusItem(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              focusItem(-1);
            }
          }}
        >
          {menu.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.disabled ? (item.disabledReason ?? undefined) : undefined}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                item.tone === "danger" ? "text-danger" : "text-text",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.label}</span>
                {item.hint ? (
                  <span className="block truncate text-xs text-text-muted">
                    {item.disabled && item.disabledReason ? item.disabledReason : item.hint}
                  </span>
                ) : item.disabled && item.disabledReason ? (
                  <span className="block truncate text-xs text-text-muted">{item.disabledReason}</span>
                ) : null}
              </span>
              {item.shortcut ? <Kbd keys={item.shortcut} className="shrink-0" /> : null}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
});
