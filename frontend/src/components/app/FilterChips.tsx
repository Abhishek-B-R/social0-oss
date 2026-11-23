import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParamList, useSearchParamState } from "./url-state";

type FilterChipProps = {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
  /** Small trailing count. */
  count?: number | null;
  /** Amber outline, e.g. a broken account ("reconnect to include"). */
  tone?: "default" | "warning";
  title?: string;
  className?: string;
};

/** One toggle chip. Use directly for local state, or via `FilterChips` for URL state. */
export function FilterChip({
  selected,
  onClick,
  children,
  icon,
  count,
  tone = "default",
  title,
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10",
        selected
          ? "border-text bg-text text-bg"
          : tone === "warning"
            ? "border-warning-border bg-warning-soft text-warning hover:border-warning"
            : "border-border bg-bg-elevated text-text-muted hover:border-text-subtle hover:text-text",
        className,
      )}
    >
      {icon}
      <span>{children}</span>
      {count != null ? (
        <span
          className={cn(
            "tabular-nums text-xs",
            selected ? "text-bg/70" : "text-text-subtle",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export type FilterOption = {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: number | null;
  tone?: "default" | "warning";
  title?: string;
};

type FilterChipsProps = {
  /** Search param that holds the selection, e.g. "network". */
  param: string;
  options: FilterOption[];
  /** Allow several values (`?network=instagram,tiktok`). Default false. */
  multiple?: boolean;
  /** Leading "All" chip label; pass null to hide it. */
  allLabel?: string | null;
  "aria-label": string;
  className?: string;
  /** Params to clear when the filter changes (default: page). */
  reset?: string[];
};

/**
 * Chip row whose state lives in the URL, so filtered views are shareable
 * and survive reloads. "All" clears the param.
 */
export function FilterChips({
  param,
  options,
  multiple = false,
  allLabel = "All",
  className,
  reset = ["page"],
  ...aria
}: FilterChipsProps) {
  const [list, setList] = useSearchParamList(param);
  const [single, setSingle] = useSearchParamState<string>(param, "");
  const selectedValues = multiple ? list : single ? [single] : [];

  const toggle = (value: string) => {
    if (multiple) {
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
      setList(next, { reset });
    } else {
      setSingle(single === value ? null : value, { reset });
    }
  };

  return (
    <div
      role="group"
      aria-label={aria["aria-label"]}
      className={cn("scroll-touch flex items-center gap-1.5 overflow-x-auto", className)}
    >
      {allLabel != null ? (
        <FilterChip
          selected={selectedValues.length === 0}
          onClick={() => (multiple ? setList([], { reset }) : setSingle(null, { reset }))}
        >
          {allLabel}
        </FilterChip>
      ) : null}
      {options.map((o) => (
        <FilterChip
          key={o.value}
          selected={selectedValues.includes(o.value)}
          onClick={() => toggle(o.value)}
          icon={o.icon}
          count={o.count}
          tone={o.tone}
          title={o.title}
        >
          {o.label}
        </FilterChip>
      ))}
    </div>
  );
}

/** "Clear filters" link-button; renders nothing unless `active`. */
export function ClearFiltersButton({
  active,
  onClear,
  className,
}: {
  active: boolean;
  onClear: () => void;
  className?: string;
}) {
  if (!active) return null;
  return (
    <button
      type="button"
      onClick={onClear}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
    >
      <X className="h-3.5 w-3.5" aria-hidden />
      Clear filters
    </button>
  );
}
