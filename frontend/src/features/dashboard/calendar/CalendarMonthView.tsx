import { useState, type DragEvent, type MouseEvent } from "react";
import { format, isSameMonth, startOfDay } from "date-fns";
import { Plus } from "lucide-react";
import { PILL_STATUS_LABEL, type PillStatus } from "@/components/app";
import { cn } from "@/lib/utils";
import { useCalendar } from "./calendar-context";
import { CalendarPostChip } from "./CalendarPostChip";
import {
  DOT_TONE,
  atMinutes,
  dayKeyOf,
  longDayTitle,
  suggestedCreateWall,
  timeLabel,
  type CalendarEvent,
} from "./calendar-model";

const MAX_CHIPS = 3;

/** Drop handling shared by month cells: keep the post's time, change the day. */
function useDayDrop(day: Date, accept: boolean) {
  const { dragging, moveTo } = useCalendar();
  const [over, setOver] = useState(false);
  const active = accept && !!dragging;
  return {
    over: active && over,
    handlers: {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!active) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOver(false);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        setOver(false);
        if (!active || !dragging) return;
        e.preventDefault();
        moveTo(dragging, atMinutes(day, dragging.minutes));
      },
    },
  };
}

function MonthCell({
  day,
  events,
  inMonth,
  compact,
}: {
  day: Date;
  events: CalendarEvent[];
  inMonth: boolean;
  compact: boolean;
}) {
  const { nowWall, use24, canCreate, createAt, openDay, slotsByDay } = useCalendar();
  const key = dayKeyOf(day);
  const today = key === dayKeyOf(nowWall);
  const past = startOfDay(day) < startOfDay(nowWall);
  const { over, handlers } = useDayDrop(day, !past);
  const createWall = canCreate && !past
    ? suggestedCreateWall(day, slotsByDay.get(key) ?? [], nowWall)
    : null;
  const countLabel = events.length === 0
    ? "no posts"
    : `${events.length} post${events.length === 1 ? "" : "s"}`;

  if (compact) {
    const dots = events.slice(0, 4);
    return (
      <button
        type="button"
        onClick={() => openDay(key)}
        {...handlers}
        aria-label={`${longDayTitle(day)}, ${countLabel}`}
        aria-current={today ? "date" : undefined}
        className={cn(
          "flex min-h-[64px] w-full flex-col items-center gap-1 border-b border-r border-border px-1 py-1.5 text-center touch-manipulation focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 active:bg-bg-muted",
          inMonth ? "bg-bg-elevated" : "bg-bg-subtle text-text-subtle",
        )}
      >
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-medium",
            today ? "bg-accent text-accent-foreground" : inMonth ? "text-text" : "text-text-subtle",
          )}
        >
          {format(day, "d")}
        </span>
        {dots.length > 0 ? (
          <span className="flex flex-wrap items-center justify-center gap-0.5" aria-hidden>
            {dots.map((e) => (
              <span key={e.id} className={cn("size-1.5 rounded-full", DOT_TONE[e.pill])} />
            ))}
            {events.length > dots.length ? (
              <span className="text-[9px] leading-none text-text-muted">
                +{events.length - dots.length}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
    );
  }

  const shown = events.slice(0, MAX_CHIPS);
  const more = events.length - shown.length;

  const onCellClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    openDay(key);
  };

  return (
    // Clicking empty space opens the day (mouse convenience); the day-number
    // button is the keyboard path.
    <div
      onClick={onCellClick}
      {...handlers}
      className={cn(
        "group/cell relative flex min-h-[116px] min-w-0 cursor-pointer flex-col gap-1 border-b border-r border-border p-1.5 transition-colors",
        // Past days read as past through muted numbers, not a grey wash.
        inMonth ? "bg-bg-elevated" : "bg-bg-subtle/60",
        over && "bg-accent/10 ring-2 ring-inset ring-accent/60",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => openDay(key)}
          aria-label={`${longDayTitle(day)}, ${countLabel}. Open day`}
          aria-current={today ? "date" : undefined}
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-medium transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            today
              ? "bg-accent text-accent-foreground hover:bg-accent-hover"
              : !inMonth
                ? "text-text-subtle"
                : past
                  ? "text-text-muted"
                  : "text-text",
          )}
        >
          {format(day, "d")}
        </button>
        {createWall ? (
          <button
            type="button"
            onClick={() => createAt(createWall)}
            aria-label={`New post on ${longDayTitle(day)}`}
            title={`New post at ${timeLabel(createWall, use24)}`}
            className="inline-flex size-6 items-center justify-center rounded-md text-text-muted opacity-0 transition-opacity hover:bg-bg-muted hover:text-text group-hover/cell:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 touch:opacity-100"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {shown.map((e) => (
          <CalendarPostChip key={e.id} event={e} />
        ))}
        {more > 0 ? (
          <button
            type="button"
            onClick={() => openDay(key)}
            className="self-start rounded px-1 text-xs text-text-muted hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            +{more} more
          </button>
        ) : null}
      </div>
    </div>
  );
}

const LEGEND: PillStatus[] = ["published", "scheduled", "partly_published", "failed", "draft"];

export function CalendarMonthView({
  days,
  anchor,
  eventsByDay,
  compact,
}: {
  days: Date[];
  anchor: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  compact: boolean;
}) {
  const weekdays = days.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <div className="grid grid-cols-7 border-b border-border">
        {weekdays.map((d) => (
          <div
            key={d.toISOString()}
            className="px-2 py-2 text-left text-xs text-text-muted max-sm:text-center"
          >
            <span className="sm:hidden" aria-hidden>
              {format(d, "EEEEE")}
            </span>
            <span className="hidden sm:inline">{format(d, "EEE")}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
        {days.map((d) => (
          <MonthCell
            key={d.toISOString()}
            day={d}
            inMonth={isSameMonth(d, anchor)}
            events={eventsByDay.get(dayKeyOf(d)) ?? []}
            compact={compact}
          />
        ))}
      </div>
      {compact ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-border px-3 py-2">
          {LEGEND.map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-xs text-text-muted">
              <span className={cn("size-2 rounded-full", DOT_TONE[s])} aria-hidden />
              {PILL_STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
