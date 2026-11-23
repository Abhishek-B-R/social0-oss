import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ExternalLink, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCopy } from "./agents-format";

export function CopyButton({
  text,
  toastLabel = "Copied",
  label = "Copy",
  className,
  variant = "outline",
}: {
  text: string;
  toastLabel?: string;
  label?: string;
  className?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
}) {
  const { copy, copied } = useCopy();
  const done = copied === text;
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      className={cn("shrink-0", className)}
      onClick={() => void copy(text, toastLabel)}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
      {done ? "Copied" : label}
    </Button>
  );
}

/** Monospace value with a copy button; scrolls sideways when long. */
export function CodeField({
  value,
  copyLabel,
  toastLabel,
  multiline = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  copyLabel?: string;
  toastLabel?: string;
  multiline?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <div
        className="scroll-touch min-w-0 flex-1 overflow-x-auto rounded-lg bg-bg-subtle px-3 py-2"
        tabIndex={0}
        role={ariaLabel ? "region" : undefined}
        aria-label={ariaLabel}
      >
        <code
          className={cn(
            "block font-mono text-[12px] leading-5 text-text",
            multiline ? "whitespace-pre" : "whitespace-nowrap",
          )}
        >
          {value}
        </code>
      </div>
      <CopyButton
        text={value}
        label={copyLabel}
        toastLabel={toastLabel}
        variant="ghost"
        className="mt-0.5 text-text-muted hover:text-text"
      />
    </div>
  );
}

export function ExternalTextLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded",
        className,
      )}
    >
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

// ── Pills ───────────────────────────────────────────────────────────────────

/** Soft tint, no border (same look as the kit's StatusPill). */
const PILL_TONE = {
  ok: "bg-ok-soft text-ok",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  agent: "bg-agent-soft text-agent",
  info: "bg-info-soft text-info",
  neutral: "bg-chip text-text-muted",
} as const;

export type PillTone = keyof typeof PILL_TONE;

export function Pill({
  tone,
  children,
  dot = false,
  className,
  title,
}: {
  tone: PillTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 text-xs font-medium leading-none",
        PILL_TONE[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

// ── Row menu (⋯) ────────────────────────────────────────────────────────────

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
  icon?: ReactNode;
  disabled?: boolean;
};

/**
 * Small "⋯" menu. Rendered in a portal so table overflow can't clip it.
 * Arrow keys move, Esc closes and returns focus to the trigger.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuH = menuRef.current?.offsetHeight ?? 0;
      const below = r.bottom + 4;
      const top =
        below + menuH > window.innerHeight - 8 && r.top - menuH - 4 > 8
          ? r.top - menuH - 4
          : below;
      setPos({ top, right: Math.max(8, window.innerWidth - r.right) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      "[role=menuitem]:not([disabled])",
    );
    first?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role=menuitem]:not([disabled])",
      ) ?? [],
    );
    const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nodes[(idx + 1) % nodes.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodes[(idx - 1 + nodes.length) % nodes.length]?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        data-row-stop
        className="inline-flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:size-10"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKey}
              style={{
                position: "fixed",
                top: pos?.top ?? -9999,
                right: pos?.right ?? 0,
              }}
              className="z-[60] min-w-44 rounded-xl border border-border bg-bg-elevated p-1 shadow-lg"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    close(false);
                    item.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none disabled:opacity-50 touch:min-h-11",
                    item.tone === "danger"
                      ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft"
                      : "text-text hover:bg-bg-muted focus-visible:bg-bg-muted",
                  )}
                >
                  {item.icon ? (
                    <span className="[&_svg]:size-4" aria-hidden>
                      {item.icon}
                    </span>
                  ) : null}
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ── Confirm dialog ──────────────────────────────────────────────────────────

/**
 * Confirmation dialog (no window.confirm). With `confirmPhrase` the user must
 * type it before the destructive button enables.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
  pending = false,
  tone = "danger",
  confirmPhrase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: "danger" | "default";
  confirmPhrase?: string;
}) {
  const [typed, setTyped] = useState("");
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    // Clear the typed phrase whenever the dialog closes, however it closed.
    setPrevOpen(open);
    if (!open) setTyped("");
  }
  const inputId = useId();
  const matches =
    !confirmPhrase || typed.trim().toLowerCase() === confirmPhrase.toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">{description}</div>
          </DialogDescription>
        </DialogHeader>
        {confirmPhrase ? (
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (matches && !pending) onConfirm();
            }}
          >
            <label htmlFor={inputId} className="text-sm text-text-muted">
              Type <span className="font-mono font-medium text-text">{confirmPhrase}</span> to
              confirm
            </label>
            <Input
              id={inputId}
              value={typed}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
            />
          </form>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setTyped("");
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={!matches || pending}
            onClick={onConfirm}
          >
            {pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One step of a setup guide. Lives in an `<ol>` with `list-decimal`, so the
 * number is the list marker, not a badge.
 */
export function Step({ children }: { children: ReactNode }) {
  return <li className="pl-1 text-sm leading-6 text-text">{children}</li>;
}
