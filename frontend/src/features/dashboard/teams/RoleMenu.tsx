import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import {
  WORKSPACE_ROLES,
  WORKSPACE_ROLE_META,
  type WorkspaceRole,
} from "@/lib/workspace-roles";
import { cn } from "@/lib/utils";
import { ROLE_DESCRIPTIONS } from "./role-descriptions";

type Pos = { top?: number; bottom?: number; left: number; width: number };

/**
 * Role dropdown that explains each role. Listbox semantics: arrows move,
 * Enter picks, Esc closes. Rendered in a portal so table overflow can't clip it.
 */
export function RoleMenu({
  value,
  onChange,
  disabled,
  busy,
  label,
  className,
}: {
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
  disabled?: boolean;
  busy?: boolean;
  /** Accessible name, e.g. "Role for Priya". */
  label: string;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const openMenu = () => {
    setActive(Math.max(0, WORKSPACE_ROLES.indexOf(value)));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(300, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const below = window.innerHeight - r.bottom;
      setPos(
        below >= 260 || below >= r.top
          ? { top: r.bottom + 4, left, width }
          : { bottom: window.innerHeight - r.top + 4, left, width },
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, pos]);

  const pick = (role: WorkspaceRole) => {
    setOpen(false);
    buttonRef.current?.focus();
    if (role !== value) onChange(role);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${WORKSPACE_ROLE_META[value].label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-busy={busy || undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openMenu();
          }
        }}
        className={cn(
          "inline-flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-border bg-bg-elevated px-2.5 text-sm text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60 touch:h-10",
          className,
        )}
      >
        <span className="truncate">{WORKSPACE_ROLE_META[value].label}</span>
        {busy ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-text-muted motion-reduce:animate-none" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-text-muted" aria-hidden />
        )}
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={listRef}
              id={`${id}-list`}
              role="listbox"
              tabIndex={-1}
              aria-label={label}
              aria-activedescendant={`${id}-opt-${active}`}
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
              onKeyDown={(e) => {
                if (e.key === "Escape" || e.key === "Tab") {
                  e.preventDefault();
                  setOpen(false);
                  buttonRef.current?.focus();
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => (i + 1) % WORKSPACE_ROLES.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => (i - 1 + WORKSPACE_ROLES.length) % WORKSPACE_ROLES.length);
                } else if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(WORKSPACE_ROLES[active]!);
                }
              }}
              className="fixed z-[60] rounded-xl border border-border bg-bg-elevated p-1 shadow-lg focus:outline-none"
            >
              {WORKSPACE_ROLES.map((role, i) => (
                <li
                  key={role}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={role === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(role)}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2",
                    i === active && "bg-bg-muted",
                  )}
                >
                  <span className="mt-0.5 size-4 shrink-0 text-accent">
                    {role === value ? <Check className="size-4" aria-hidden /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text">
                      {WORKSPACE_ROLE_META[role].label}
                    </span>
                    <span className="block text-xs text-text-muted">{ROLE_DESCRIPTIONS[role]}</span>
                  </span>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
