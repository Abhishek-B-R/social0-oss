import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type MenuItem =
  | {
      kind?: "item";
      label: ReactNode;
      /** Internal path (navigates) or external URL (new tab). */
      href?: string;
      external?: boolean;
      /** Router location state for internal hrefs. */
      state?: unknown;
      onSelect?: () => void;
      icon?: ReactNode;
      tone?: "default" | "danger";
      disabled?: boolean;
      /** Radio-style check (filter menus). */
      checked?: boolean;
    }
  | { kind: "separator" }
  | { kind: "label"; label: string };

type ActionMenuProps = {
  items: MenuItem[];
  /** Renders the trigger; spread `props` onto a <button>. */
  trigger: (props: {
    ref: (el: HTMLButtonElement | null) => void;
    onClick: () => void;
    onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
    "data-row-stop": true;
  }) => ReactNode;
  align?: "start" | "end";
  /** Min width of the menu in px. */
  width?: number;
  "aria-label": string;
};

type Pos = { top: number; left: number; placeUp: boolean };

/**
 * Small dropdown menu (⋯ actions, filter pickers). Rendered in a portal with
 * fixed positioning so table overflow never clips it. Arrow keys move,
 * Esc / Tab / outside click close and return focus to the trigger.
 */
export function ActionMenu({
  items,
  trigger,
  align = "end",
  width = 208,
  "aria-label": ariaLabel,
}: ActionMenuProps) {
  const navigate = useNavigate();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [focusWhich, setFocusWhich] = useState<"first" | "last">("first");

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerEl?.focus();
  }, [triggerEl]);

  const place = useCallback(() => {
    const el = triggerEl;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 240;
    const spaceBelow = window.innerHeight - r.bottom;
    const placeUp = spaceBelow < menuH + 12 && r.top > spaceBelow;
    const rawLeft = align === "end" ? r.right - width : r.left;
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8));
    setPos({ top: placeUp ? r.top - 4 : r.bottom + 4, left, placeUp });
  }, [align, width, triggerEl]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerEl?.contains(t)) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close, triggerEl]);

  // Focus the first (or last) item once the menu is placed.
  useEffect(() => {
    if (!open || !pos) return;
    const which = focusWhich;
    const els = menuRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem']:not([aria-disabled='true'])");
    if (!els?.length) return;
    (which === "last" ? els[els.length - 1] : els[0])?.focus();
  }, [open, pos, focusWhich]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem']:not([aria-disabled='true'])") ?? [],
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

  const activate = (item: Extract<MenuItem, { kind?: "item" }>) => {
    if (item.disabled) return;
    close();
    if (item.onSelect) item.onSelect();
    if (item.href) {
      if (item.external || /^https?:/.test(item.href)) {
        window.open(item.href, "_blank", "noopener,noreferrer");
      } else {
        navigate(item.href, item.state !== undefined ? { state: item.state } : undefined);
      }
    }
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            onKeyDown={onMenuKey}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              minWidth: width,
              transform: pos?.placeUp ? "translateY(-100%)" : undefined,
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-[70] max-h-[min(24rem,70vh)] overflow-y-auto rounded-xl border border-border bg-bg-elevated p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.28)]"
          >
            {items.map((item, i) => {
              if (item.kind === "separator") {
                return <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-border" />;
              }
              if (item.kind === "label") {
                return (
                  <div
                    key={`lbl-${i}`}
                    className="px-2.5 pb-1 pt-2 text-xs font-medium text-text-muted"
                  >
                    {item.label}
                  </div>
                );
              }
              const isRadio = item.checked !== undefined;
              return (
                <button
                  key={i}
                  type="button"
                  role={isRadio ? "menuitemradio" : "menuitem"}
                  aria-checked={isRadio ? item.checked : undefined}
                  aria-disabled={item.disabled || undefined}
                  tabIndex={-1}
                  onClick={() => activate(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium outline-none transition-colors",
                    "focus-visible:bg-bg-muted hover:bg-bg-muted touch:py-2.5",
                    item.tone === "danger" ? "text-danger" : "text-text",
                    item.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                  )}
                >
                  {item.icon ? (
                    <span className="flex size-4 shrink-0 items-center justify-center text-text-muted [&_svg]:size-4" aria-hidden>
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {isRadio && item.checked ? (
                    <Check className="size-3.5 shrink-0 text-text" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger({
        ref: setTriggerEl,
        onClick: () => {
          setFocusWhich("first");
          setOpen((v) => !v);
        },
        onKeyDown: (e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setFocusWhich(e.key === "ArrowUp" ? "last" : "first");
            setOpen(true);
          }
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? menuId : undefined,
        "data-row-stop": true,
      })}
      {menu}
    </>
  );
}
