import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { CalendarBlank, CaretLeft, CaretRight } from "@/icons/phosphor";
import {
  WINDOW_PRESET_OPTIONS,
  type DateWindow,
  type WindowPreset,
} from "@/lib/date-window";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";
import "./range-toolbar.css";

type RangeToolbarProps = {
  value: DateWindow;
  onChange: (next: DateWindow) => void;
  label?: string;
};

function presetSinceUntil(preset: WindowPreset): { since: Date; until: Date } {
  const until = new Date();
  const days =
    preset === "7d"
      ? 7
      : preset === "14d"
        ? 14
        : preset === "28d"
          ? 28
          : preset === "90d"
            ? 90
            : 365;
  return { since: subDays(until, days), until };
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

export function RangeToolbar({ value, onChange, label = "Date range" }: RangeToolbarProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const until = value.until ? new Date(value.until) : new Date();
  const since = value.since
    ? new Date(value.since)
    : presetSinceUntil(value.range === "custom" ? "7d" : value.range).since;
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
    value.range === "custom" && value.since && value.until
      ? `${format(new Date(value.since), "MMM d")} – ${format(new Date(value.until), "MMM d, yyyy")}`
      : `${format(since, "MMM d")} – ${format(until, "MMM d, yyyy")}`;

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
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
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
                "h-8 min-w-9 rounded-full px-2.5 text-xs font-semibold tracking-wide transition-colors sm:px-3",
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
                  since: startOfDay(next.from).toISOString(),
                  until: endOfDay(next.to).toISOString(),
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
