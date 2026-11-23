import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSearchParamState } from "./url-state";

export type TabItem<T extends string = string> = {
  value: T;
  label: ReactNode;
  /** Shown as a small count after the label. `null`/undefined hides it. */
  count?: number | null;
  /** "danger" paints the count red when > 0 (e.g. Failed); otherwise counts are plain muted numbers. */
  tone?: "default" | "danger";
  disabled?: boolean;
};

type TabsProps<T extends string> = {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
  /** Underline (page tabs, default) or pill (segmented control). */
  variant?: "underline" | "pill";
  /** id prefix: tab buttons get `${idBase}-tab-${value}`, panels can use `${idBase}-panel-${value}`. */
  idBase?: string;
};

/** Accessible tab list with counts. Arrow keys move between tabs. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  variant = "underline",
  idBase,
  ...aria
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.value === value);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % enabled.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + enabled.length) % enabled.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = enabled.length - 1;
    const target = enabled[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.value);
    const btn = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab-value="${CSS.escape(target.value)}"]`,
    );
    btn?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      className={cn(
        "scroll-touch flex max-w-full items-center overflow-x-auto",
        variant === "underline"
          ? "gap-4 border-b border-border"
          : "gap-1 rounded-xl bg-bg-muted p-1",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        const showDanger = item.tone === "danger" && (item.count ?? 0) > 0;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={idBase ? `${idBase}-tab-${item.value}` : undefined}
            aria-controls={idBase ? `${idBase}-panel-${item.value}` : undefined}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            data-tab-value={item.value}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50",
              variant === "underline"
                ? cn(
                    "-mb-px border-b-2 px-0.5 pb-2.5 pt-1",
                    selected
                      ? "border-text text-text"
                      : "border-transparent text-text-muted hover:text-text",
                  )
                : cn(
                    "rounded-lg px-3 py-1.5",
                    selected
                      ? "bg-bg-elevated text-text shadow-sm"
                      : "text-text-muted hover:text-text",
                  ),
            )}
          >
            {item.label}
            {item.count != null ? (
              <span
                className={cn(
                  "text-xs font-normal tabular-nums",
                  showDanger ? "font-medium text-danger" : "text-text-subtle",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tabs bound to a search param (default `?tab=`). The default value is not
 * written to the URL. Changing tab resets `page`.
 */
export function UrlTabs<T extends string>({
  param = "tab",
  defaultValue,
  onValueChange,
  ...rest
}: Omit<TabsProps<T>, "value" | "onChange"> & {
  param?: string;
  defaultValue: T;
  onValueChange?: (value: T) => void;
}) {
  const [value, setValue] = useSearchParamState<T>(param, defaultValue);
  const known = rest.items.some((i) => i.value === value) ? value : defaultValue;
  return (
    <Tabs
      {...rest}
      value={known}
      onChange={(v) => {
        setValue(v, { reset: ["page"] });
        onValueChange?.(v);
      }}
    />
  );
}
