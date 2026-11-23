import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { DayPicker, type DateRange } from "react-day-picker";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { CaretDown, CaretLeft, CaretRight } from "@/icons/phosphor";
import { getUserSettingsSnapshot } from "@/api/settings";
import { formatRangeLabel } from "@/features/dashboard/analytics/analytics-utils";
import {
  WINDOW_PRESETS,
  WINDOW_PRESET_RANGE_LABEL,
  type DateWindow,
  type WindowPreset,
} from "@/lib/date-window";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";
import "@/components/dashboard/range-toolbar.css";

/**
 * A quiet native select for the inbox filter row: same height as the
 * status segment next to it, caret drawn by us so it looks the same on
 * every browser.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  /** Screen-reader label; the selected option already says what it is. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("relative inline-flex min-w-0", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-border bg-bg-elevated py-0 pr-8 pl-3 text-[13px] font-medium text-text transition-colors hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10"
      >
        {children}
      </select>
      <CaretDown
        size={12}
        weight="bold"
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-muted"
      />
    </label>
  );
}

function zonedDayIso(d: Date, timeZone: string, end: boolean): string {
  const wall = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    end ? 23 : 0,
    end ? 59 : 0,
    end ? 59 : 0,
    end ? 999 : 0,
  );
  try {
    return fromZonedTime(wall, timeZone).toISOString();
  } catch {
    return (end ? endOfDay(d) : startOfDay(d)).toISOString();
  }
}

function Chevron({ orientation, className }: { orientation?: string; className?: string }) {
  return orientation === "left" ? (
    <CaretLeft className={className} size={16} weight="bold" />
  ) : (
    <CaretRight className={className} size={16} weight="bold" />
  );
}

const PICK_CUSTOM = "__pick_custom";

const WIDE_QUERY = "(min-width: 640px)";

/** Two months side by side on wider screens, one on phones. */
function useWideScreen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
}

/**
 * Date range as one select: the presets, plus "Custom range…" which opens
 * a picker under it (two months on wide screens). A custom range shows as
 * the dates the server resolved, which it clamps to a year and to now.
 */
export function InboxRangeSelect({
  value,
  onChange,
  resolvedSince,
  resolvedUntil,
  resolvedTimeZone,
}: {
  value: DateWindow;
  onChange: (next: DateWindow) => void;
  /** `since` / `until` from the list result, once it has loaded. */
  resolvedSince?: string | null;
  resolvedUntil?: string | null;
  /**
   * Zone the server resolved the window in (the workspace owner's in a team).
   * Custom-range days are sent and labelled in it.
   */
  resolvedTimeZone?: string | null;
}) {
  const settingsQuery = useQuery({
    queryKey: ["user-settings-snapshot"],
    queryFn: getUserSettingsSnapshot,
    staleTime: 5 * 60_000,
  });
  const timeZone = resolvedTimeZone || settingsQuery.data?.timezone?.trim() || "UTC";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerId = useId();
  const [draft, setDraft] = useState<DateRange | undefined>();
  const wide = useWideScreen();
  const popoverRef = useRef<HTMLDivElement>(null);

  // The select can sit mid-row (after the status tabs on a phone), so a
  // left-anchored popover would run past the right edge. Slide it left just
  // enough to stay inside a 16px gutter.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const pop = popoverRef.current;
      const root = rootRef.current;
      if (!pop || !root) return;
      const gutter = 16;
      const left = root.getBoundingClientRect().left;
      const overflow = left + pop.offsetWidth - (window.innerWidth - gutter);
      const shift = overflow > 0 ? Math.min(overflow, Math.max(0, left - gutter)) : 0;
      pop.style.transform = shift ? `translateX(${-shift}px)` : "";
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, wide]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shownSince = resolvedSince ?? value.since;
  const shownUntil = resolvedUntil ?? value.until;
  const customLabel =
    value.range === "custom" && shownSince && shownUntil
      ? formatRangeLabel(shownSince, shownUntil, timeZone)
      : null;

  const openPicker = () => {
    const until = (value.range === "custom" ? shownUntil : null) ?? new Date().toISOString();
    const since =
      (value.range === "custom" ? shownSince : null) ??
      startOfDay(subDays(new Date(until), 6)).toISOString();
    setDraft({ from: new Date(since), to: new Date(until) });
    setOpen(true);
  };

  return (
    <div ref={rootRef} className="relative">
      <FilterSelect
        label="Date range"
        value={value.range}
        onChange={(next) => {
          if (next === PICK_CUSTOM) {
            openPicker();
            return;
          }
          setOpen(false);
          onChange({ range: next as WindowPreset });
        }}
      >
        {WINDOW_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {WINDOW_PRESET_RANGE_LABEL[preset]}
          </option>
        ))}
        {customLabel ? <option value="custom">{customLabel}</option> : null}
        <option value={PICK_CUSTOM}>Custom range…</option>
      </FilterSelect>

      {open ? (
        <div
          ref={popoverRef}
          id={pickerId}
          role="dialog"
          aria-label="Pick a date range"
          className="absolute top-full left-0 z-40 mt-2 max-w-[calc(100vw-2rem)] overflow-x-auto rounded-xl border border-border bg-bg-elevated p-3 shadow-xl sm:p-4"
        >
          <DayPicker
            mode="range"
            numberOfMonths={wide ? 2 : 1}
            navLayout="around"
            showOutsideDays
            // The seeded draft is a full range: without this the first click
            // completes a new range at once and fires a live read.
            resetOnSelect
            // Day count between the ends; 364 keeps the whole span inside the
            // server's one-year cap so it never clamps silently.
            max={364}
            className="range-toolbar-cal"
            selected={draft}
            onSelect={(next) => {
              setDraft(next);
              if (next?.from && next.to) {
                onChange({
                  range: "custom",
                  since: zonedDayIso(next.from, timeZone, false),
                  until: zonedDayIso(next.to, timeZone, true),
                });
                setOpen(false);
              }
            }}
            disabled={{ after: new Date() }}
            defaultMonth={wide ? subDays(draft?.to ?? new Date(), 30) : (draft?.to ?? new Date())}
            components={{ Chevron }}
          />
          <p className="mt-2 px-1 text-xs text-text-muted">
            Pick a start and end day. Up to one year.
          </p>
        </div>
      ) : null}
    </div>
  );
}
