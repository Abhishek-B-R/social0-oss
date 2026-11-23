import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type BillingMenuItem = {
  key: string;
  label: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
};

/**
 * ⋯ menu on the plan card. Holds the rare, consequential actions
 * (payment method, pausing, cancel) so they never sit next to "Change plan".
 */
export function BillingMenu({
  items,
  disabled,
}: {
  items: BillingMenuItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    const first = menuRef.current?.querySelector<HTMLElement>(
      "[role='menuitem']:not([aria-disabled='true'])",
    );
    first?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = (restore = true) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
  };

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        "[role='menuitem']:not([aria-disabled='true'])",
      ) ?? [],
    );
    const idx = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(idx + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(idx - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="More billing actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-bg-elevated text-text-muted shadow-sm transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 touch:size-11"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Billing actions"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-border bg-bg-elevated p-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                close(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-bg-muted hover:bg-bg-muted touch:py-3",
                item.tone === "danger" ? "text-danger" : "text-text",
                item.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {item.icon ? (
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 shrink-0 [&_svg]:size-4",
                    item.tone === "danger" ? "text-danger" : "text-text-muted",
                  )}
                >
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0">
                <span className="block font-medium">{item.label}</span>
                {item.hint ? (
                  <span className="block text-xs text-text-muted">{item.hint}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
