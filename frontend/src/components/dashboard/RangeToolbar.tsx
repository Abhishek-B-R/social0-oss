import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DayPicker, type DateRange } from "react-day-picker";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { CalendarBlank, CaretLeft, CaretRight } from "@/icons/phosphor";
import { getUserSettingsSnapshot } from "@/api/settings";
import {
  WINDOW_PRESET_OPTIONS,
  WINDOW_PRESET_RANGE_LABEL,
  type DateWindow,
  type WindowPreset,
} from "@/lib/date-window";
import { formatRangeLabel } from "@/features/dashboard/analytics/analytics-utils";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";
import "./range-toolbar.css";

type RangeToolbarProps = {
  value: DateWindow;
  onChange: (next: DateWindow) => void;
  label?: string;
  resolvedSince?: string | null;
  resolvedUntil?: string | null;
};

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

function RangeChevron({
  orientation,
  className,
  size = 16,
}: {
  className?: string;
  size?: number;
  orientation?: "up" | "down" | "left" | "right";
}) {
  if (orientation === "left") {
    return <CaretLeft className={className} size={size} weight="bold" />;
  }
  if (orientation === "right") {
    return <CaretRight className={className} size={size} weight="bold" />;
  }
  return <CaretRight className={className} size={size} weight="bold" />;
}

export function RangeToolbar({
  value,
  onChange,
  label = "Date range",
  resolvedSince,
  resolvedUntil,
}: RangeToolbarProps) {
  const settingsQuery = useQuery({
    queryKey: ["user-settings-snapshot"],
    queryFn: getUserSettingsSnapshot,
    staleTime: 5 * 60_000,
  });
  const timeZone = settingsQuery.data?.timezone?.trim() || "UTC";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const until = value.until ? new Date(value.until) : new Date();
  const since = value.since
    ? new Date(value.since)
    : startOfDay(subDays(until, 6));
  const [draft, setDraft] = useState<DateRange>({ from: since, to: until });

  useEffect(() => {
    if (!open) return;
    setDraft({ from: since, to: until });
  }, [open, since, until]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const rangeLabel =
    resolvedSince && resolvedUntil
      ? formatRangeLabel(resolvedSince, resolvedUntil, timeZone)
      : value.range === "custom" && value.since && value.until
        ? formatRangeLabel(value.since, value.until, timeZone)
        : WINDOW_PRESET_RANGE_LABEL[
            value.range === "custom" ? "7d" : (value.range as WindowPreset)
          ];

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex w-full items-center gap-0.5 rounded-full border border-border bg-bg-muted p-1 sm:w-auto"
      >
        <button
          type="button"
          aria-label="Custom date range"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97]",
            value.range === "custom" || open
              ? "bg-foreground text-background"
              : "text-text-muted hover:text-text",
          )}
        >
          <CalendarBlank size={16} />
        </button>
        {WINDOW_PRESET_OPTIONS.map((opt) => {
          const selected = value.range === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setOpen(false);
                onChange({ range: opt.value });
              }}
              className={cn(
                "h-8 min-w-9 rounded-full px-2.5 text-xs font-semibold tracking-wide transition-[transform,background-color,color,opacity] duration-150 ease-out active:scale-[0.97] sm:px-3",
                selected
                  ? "bg-foreground text-background shadow-sm"
                  : "text-text-muted hover:text-text",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-sm font-medium tabular-nums text-text-muted">{rangeLabel}</p>

      {open ? (
        <div className="absolute top-full left-0 z-40 mt-2 rounded-2xl border border-border bg-bg-elevated p-4 shadow-xl">
          <DayPicker
            mode="range"
            numberOfMonths={2}
            navLayout="around"
            showOutsideDays
            className="range-toolbar-cal"
            selected={draft}
            onSelect={(next) => {
              setDraft(next ?? { from: undefined, to: undefined });
              if (next?.from && next.to) {
                onChange({
                  range: "custom",
                  since: zonedDayIso(next.from, timeZone, false),
                  until: zonedDayIso(next.to, timeZone, true),
                });
              }
            }}
            disabled={{ after: new Date() }}
            defaultMonth={subDays(new Date(), 30)}
            components={{ Chevron: RangeChevron }}
          />
        </div>
      ) : null}
    </div>
  );
}
