import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import type { DateWindow } from "@/lib/date-window";
import { cn } from "@/lib/utils";
import { RANGE_CHIPS } from "./analytics-model";
import { formatRangeLabel } from "./analytics-utils";
import "react-day-picker/style.css";
import "@/components/dashboard/range-toolbar.css";

/** Midnight / end of day of a picked calendar day, in the user's zone. */
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

function PickerChevron({
  orientation,
  className,
}: {
  className?: string;
  size?: number;
  orientation?: "up" | "down" | "left" | "right";
}) {
  const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

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
 * Range chips (7D · 28D · 3M · 1Y) plus "Custom" with a two-month picker.
 * Presets resolve on the server in the user's timezone; custom sends
 * zoned day bounds.
 */
export function AnalyticsRangeControl({
  value,
  onChange,
  timeZone,
  resolvedSince,
  resolvedUntil,
}: {
  value: DateWindow;
  onChange: (next: DateWindow) => void;
  timeZone: string;
  resolvedSince?: string | null;
  resolvedUntil?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const customBtnRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const wide = useWideScreen();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        customBtnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openPicker = () => {
    const until = resolvedUntil ?? value.until ?? new Date().toISOString();
    const since =
      resolvedSince ?? value.since ?? startOfDay(subDays(new Date(until), 27)).toISOString();
    setDraft({ from: new Date(since), to: new Date(until) });
    setOpen(true);
  };

  const customLabel =
    value.range === "custom" && (resolvedSince ?? value.since) && (resolvedUntil ?? value.until)
      ? formatRangeLabel(
          (resolvedSince ?? value.since)!,
          (resolvedUntil ?? value.until)!,
          timeZone,
        )
      : "Custom";

  return (
    <div ref={rootRef} className="relative">
      <div
        role="group"
        aria-label="Date range"
        className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-bg-muted p-0.5"
      >
        {/*
          Only text color animates. The selected background snaps: fading it
          left the old chip lit next to the new one (28D and 1Y both looked
          selected) whenever the page wasn't painting frames.
        */}
        {RANGE_CHIPS.map((opt) => {
          const selected = value.range === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setOpen(false);
                onChange({ range: opt.value });
              }}
              className={cn(
                "h-7 min-w-10 shrink-0 rounded-full px-2.5 text-xs font-semibold tabular-nums transition-[color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-9",
                selected
                  ? "bg-bg-elevated text-text shadow-sm"
                  : "text-text-muted hover:text-text",
              )}
            >
              {opt.label}
            </button>
          );
        })}
        <button
          ref={customBtnRef}
          type="button"
          aria-pressed={value.range === "custom"}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => (open ? setOpen(false) : openPicker())}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-[color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-9",
            value.range === "custom" || open
              ? "bg-bg-elevated text-text shadow-sm"
              : "text-text-muted hover:text-text",
          )}
        >
          <CalendarRange className="size-3.5" aria-hidden />
          <span className="whitespace-nowrap">{customLabel}</span>
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Pick a date range"
          className="absolute right-0 top-full z-40 mt-2 max-w-[calc(100vw-2rem)] overflow-x-auto rounded-2xl border border-border bg-bg-elevated p-3 shadow-xl sm:p-4"
        >
          <DayPicker
            mode="range"
            numberOfMonths={wide ? 2 : 1}
            navLayout="around"
            showOutsideDays
            resetOnSelect
            // `max` counts the gap between the two days, so 364 is 365
            // inclusive days: the server's custom-window cap. 365 would let
            // the server clamp away the first day's posts.
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
            components={{ Chevron: PickerChevron }}
          />
          <p className="mt-2 px-1 text-xs text-text-muted">
            Pick a start and end day. Up to one year.
          </p>
        </div>
      ) : null}
    </div>
  );
}
