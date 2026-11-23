import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, LayoutGrid, Rows3, Search, X } from "lucide-react";
import {
  ClearFiltersButton,
  NetworkIcon,
  networkLabel,
  Tabs,
  useHotkeys,
} from "@/components/app";
import { cn } from "@/lib/utils";
import { ActionMenu, type MenuItem } from "./ActionMenu";

type Option = { value: string; label: string };

const TIME_OPTIONS: Option[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

const SORT_OPTIONS: Option[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

function useParam(key: string) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  const set = useCallback(
    (next: string | null) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next == null || next === "") p.delete(key);
          else p.set(key, next);
          p.delete("page");
          return p;
        },
        { replace: true },
      ),
    [key, setParams],
  );
  return [value, set] as const;
}

/**
 * One filter as a chip: "Network: any ▾". Picking a value shows it in the
 * chip with an ✕ to clear. State lives in the URL.
 */
function FilterMenuChip({
  name,
  param,
  options,
  anyLabel = "any",
  renderIcon,
}: {
  name: string;
  param: string;
  options: Option[];
  anyLabel?: string;
  renderIcon?: (value: string) => ReactNode;
}) {
  const [value, setValue] = useParam(param);
  const selected = options.find((o) => o.value === value) ?? null;
  // A value that's no longer offered (e.g. a disconnected account) still shows.
  const label = selected?.label ?? value;
  const items: MenuItem[] = [
    { label: `Any ${name.toLowerCase()}`, checked: !value, onSelect: () => setValue(null) },
    ...options.map((o) => ({
      label: o.label,
      checked: o.value === value,
      icon: renderIcon?.(o.value),
      onSelect: () => setValue(o.value),
    })),
  ];
  const active = !!value;
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full border text-[13px] font-medium transition-colors touch:h-10",
        active ? "border-text bg-text text-bg" : "border-border bg-bg-elevated text-text-muted hover:border-text-subtle hover:text-text",
      )}
    >
      <ActionMenu
        aria-label={`Filter by ${name.toLowerCase()}`}
        align="start"
        items={items}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            className="inline-flex h-full items-center gap-1 rounded-full pl-3 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {active && renderIcon && value ? (
              <span className="mr-0.5 inline-flex [&_svg]:size-3.5">{renderIcon(value)}</span>
            ) : null}
            <span className={active ? "text-bg/70" : undefined}>{name}:</span>
            <span className="max-w-[10rem] truncate">{active ? label : anyLabel}</span>
            {!active ? <ChevronDown className="size-3.5 opacity-70" aria-hidden /> : null}
          </button>
        )}
      />
      {active ? (
        <button
          type="button"
          onClick={() => setValue(null)}
          aria-label={`Clear ${name.toLowerCase()} filter`}
          className="mr-1 inline-flex size-6 items-center justify-center rounded-full text-bg/80 hover:bg-bg/15 hover:text-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/** Caption search, debounced into `?q=`. "/" focuses it. */
export function PostsSearchBox() {
  const [q, setQ] = useParam("q");
  const [text, setText] = useState(q ?? "");
  const [seen, setSeen] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL changed elsewhere (Clear filters, back button) → follow it.
  if (q !== seen) {
    setSeen(q);
    if ((q ?? "") !== text.trim()) setText(q ?? "");
  }

  useEffect(() => {
    const next = text.trim();
    if (next === (q ?? "")) return;
    const t = window.setTimeout(() => setQ(next || null), 300);
    return () => window.clearTimeout(t);
  }, [text, q, setQ]);

  useHotkeys([
    {
      keys: "/",
      handler: () => {
        inputRef.current?.focus();
        inputRef.current?.select();
      },
    },
  ]);

  return (
    <label className="relative block w-full sm:w-64">
      <span className="sr-only">Search posts</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && text) {
            e.preventDefault();
            e.stopPropagation();
            setText("");
          }
        }}
        placeholder="Search posts"
        className="h-9 w-full rounded-xl border border-border bg-bg-elevated pl-9 pr-3 text-sm text-text placeholder:text-text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 touch:h-11"
      />
    </label>
  );
}

export type PostsView = "table" | "cards";

/**
 * Filter row under the tabs: removable filter chips (network, account,
 * source, date), sort, and the Table/Cards toggle.
 */
export function PostsFilters({
  platformOptions,
  accountOptions,
  sourceOptions,
  view,
  onViewChange,
}: {
  platformOptions: Option[];
  accountOptions: Option[];
  /** Every post source in this workspace (server-side `source` filter). */
  sourceOptions: Option[];
  view: PostsView;
  onViewChange: (view: PostsView) => void;
}) {
  const [params, setParams] = useSearchParams();
  const active = ["platform", "account", "source", "time", "q"].some((k) => !!params.get(k));
  const [sort, setSort] = useParam("sort");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Filters"
        className="scroll-touch -mx-3 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-3 max-sm:basis-full sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        <FilterMenuChip
          name="Network"
          param="platform"
          options={platformOptions.map((o) => ({ ...o, label: networkLabel(o.value) }))}
          renderIcon={(v) => <NetworkIcon network={v} size={14} label="" />}
        />
        <FilterMenuChip name="Account" param="account" options={accountOptions} />
        <FilterMenuChip name="Source" param="source" options={sourceOptions} />
        <FilterMenuChip name="Date" param="time" options={TIME_OPTIONS} anyLabel="any time" />
        <ClearFiltersButton
          active={active}
          onClear={() =>
            setParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                for (const k of ["platform", "account", "source", "time", "q", "page"]) p.delete(k);
                return p;
              },
              { replace: true },
            )
          }
        />
      </div>
      <div className="flex items-center gap-2">
        <ActionMenu
          aria-label="Sort posts"
          items={SORT_OPTIONS.map((o) => ({
            label: o.label,
            checked: (sort ?? "newest") === o.value,
            onSelect: () => setSort(o.value === "newest" ? null : o.value),
          }))}
          trigger={(props) => (
            <button
              type="button"
              {...props}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-text-muted hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10"
            >
              {sort === "oldest" ? "Oldest first" : "Newest first"}
              <ChevronDown className="size-3.5" aria-hidden />
            </button>
          )}
        />
        <Tabs
          aria-label="Layout"
          variant="pill"
          value={view}
          onChange={onViewChange}
          className="p-0.5"
          items={[
            {
              value: "table",
              label: (
                <span className="inline-flex items-center gap-1">
                  <Rows3 className="size-3.5" aria-hidden />
                  <span className="sr-only sm:not-sr-only">Table</span>
                </span>
              ),
            },
            {
              value: "cards",
              label: (
                <span className="inline-flex items-center gap-1">
                  <LayoutGrid className="size-3.5" aria-hidden />
                  <span className="sr-only sm:not-sr-only">Cards</span>
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
