import {
  useEffect,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/** Bordered, horizontally scrollable `<table>` shell. */
export function DataTable({
  children,
  className,
  tableClassName,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  tableClassName?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      className={cn(
        // `relative` keeps absolutely positioned cells' content (the
        // `sr-only` "Actions" header) inside the scroller: without it they
        // escape the overflow clip and scroll the whole page sideways.
        "scroll-touch relative w-full overflow-x-auto rounded-xl border border-border bg-bg-elevated",
        className,
      )}
    >
      <table
        aria-label={ariaLabel}
        className={cn("w-full border-collapse text-sm", tableClassName)}
      >
        {children}
      </table>
    </div>
  );
}

export function DataTableHeader({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-border", className)}
      {...props}
    />
  );
}

export function DataTableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function DataTableHead({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        // Sentence case, 12px, muted. Pass labels as written ("Last post"),
        // never upper-cased: small caps with tracking read as generated.
        "h-9 whitespace-nowrap px-3 text-left align-middle text-xs font-medium text-text-muted first:pl-4 last:pr-4",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-3 py-2.5 align-middle first:pl-4 last:pr-4", className)}
      {...props}
    />
  );
}

type RowProps = HTMLAttributes<HTMLTableRowElement> & {
  selected?: boolean;
  /** Makes the whole row clickable and keyboard-activatable (Enter). */
  onActivate?: () => void;
  /** Visual emphasis for rows that need attention (failed / broken). */
  tone?: "default" | "danger" | "warning" | "muted";
};

/**
 * Table row. With `onActivate`, clicks anywhere except on interactive
 * children (links, buttons, inputs, `[data-row-stop]`) activate the row.
 */
export function DataTableRow({
  selected,
  onActivate,
  tone = "default",
  className,
  onClick,
  onKeyDown,
  ...props
}: RowProps) {
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest("a,button,input,select,textarea,label,[data-row-stop]");

  const handleClick = (e: MouseEvent<HTMLTableRowElement>) => {
    onClick?.(e);
    if (!onActivate || e.defaultPrevented || isInteractiveTarget(e.target)) return;
    // Let users select text without opening the row.
    if (window.getSelection()?.toString()) return;
    onActivate();
  };
  const handleKey = (e: KeyboardEvent<HTMLTableRowElement>) => {
    onKeyDown?.(e);
    if (!onActivate || e.defaultPrevented) return;
    if (e.key === "Enter" && e.target === e.currentTarget) {
      e.preventDefault();
      onActivate();
    }
  };

  return (
    <tr
      aria-selected={selected || undefined}
      tabIndex={onActivate ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKey}
      className={cn(
        // `group/row` drives <RowActions> (actions shown on hover/focus).
        "group/row border-b border-border last:border-b-0 transition-colors",
        !onActivate && "hover:bg-bg-subtle/40",
        onActivate &&
          // Same tint as hover plus an accent edge on the first cell, so the
          // row J/K or Tab landed on is visible in both themes (outlines on
          // <tr> don't render in every browser; cell shadows do).
          "cursor-pointer hover:bg-bg-subtle/70 focus-visible:bg-bg-subtle focus-visible:outline-none focus-visible:[&>td:first-child]:shadow-[inset_3px_0_0_var(--accent)]",
        selected && "bg-accent/[0.06] hover:bg-accent/[0.09]",
        tone === "danger" && !selected && "bg-danger-soft/40",
        tone === "warning" && !selected && "bg-warning-soft/50",
        tone === "muted" && "opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Row-level actions that stay out of the way: hidden until the row is
 * hovered or anything in it has focus (keyboard users Tab straight into
 * them), always shown on touch screens and on selected rows.
 *
 * Put `visible` on problem rows so their fix (Retry, Reconnect) never
 * hides. The parent row needs the `group/row` class: `DataTableRow` has it;
 * card or list rows add it themselves. Buttons inside should be quiet
 * (ghost / text), never filled.
 */
export function RowActions({
  children,
  visible = false,
  className,
}: {
  children: ReactNode;
  /** Always shown (problem rows). */
  visible?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-1 transition-opacity duration-150 motion-reduce:transition-none",
        !visible &&
          "opacity-0 focus-within:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-aria-selected/row:opacity-100 [@media(hover:none)]:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Checkbox for a row or the header (`indeterminate` for partial selection). */
export function SelectCheckbox({
  checked,
  indeterminate = false,
  onToggle,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  /** `range` is true on shift-click, for range selection. */
  onToggle: (opts: { range: boolean }) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  // The label pads the 16px box to a 24px hit area (44px on touch screens)
  // with negative margins, so layout is unchanged but a tap near the box
  // toggles it instead of landing on a `data-row-stop` dead zone.
  return (
    <label
      data-row-stop
      onClick={(e) => e.stopPropagation()}
      className="-m-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center align-middle touch:-m-3.5 touch:size-11"
    >
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        checked={checked}
        data-row-stop
        onChange={() => {}}
        onClick={(e) => {
          e.stopPropagation();
          onToggle({ range: e.shiftKey });
        }}
        className={cn(
          "h-4 w-4 cursor-pointer rounded border-border align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          className,
        )}
      />
    </label>
  );
}
