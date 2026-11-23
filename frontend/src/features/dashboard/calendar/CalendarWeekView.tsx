import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { format, startOfDay } from "date-fns";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCalendar } from "./calendar-context";
import { CalendarPostChip } from "./CalendarPostChip";
import {
  atMinutes,
  chipTimeLabel,
  dayKeyOf,
  longDayTitle,
  minutesOf,
  timeLabel,
  type CalendarEvent,
  type OpenQueueSlot,
} from "./calendar-model";

const HOUR_H = 48; // base px per hour (rows grow when an hour is busy)
/** One chip / ghost slot line: text-xs leading-4 + py-0.5 + 1px border. */
const ITEM_H = 22;
const ITEM_GAP = 2;
const ROW_PAD = 3;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Variable-height hour rows shared by all 7 columns. Each row fits the
 * busiest day's posts (plus open queue slots) for that hour, one full-width
 * line each, so nothing overlaps or sits side by side.
 */
type RowLayout = { tops: number[]; heights: number[]; total: number };

function hourOf(minutes: number) {
  return Math.min(23, Math.max(0, Math.floor(minutes / 60)));
}

function rowHeightFor(n: number) {
  if (n <= 0) return HOUR_H;
  return Math.max(HOUR_H, n * ITEM_H + (n - 1) * ITEM_GAP + ROW_PAD * 2);
}

function buildRows(counts: number[]): RowLayout {
  const tops: number[] = [];
  const heights: number[] = [];
  let y = 0;
  for (const h of HOURS) {
    tops.push(y);
    const rh = rowHeightFor(counts[h] ?? 0);
    heights.push(rh);
    y += rh;
  }
  return { tops, heights, total: y };
}

/** Pixel offset of a minute-of-day, interpolated inside its hour row. */
function yOfMinutes(rows: RowLayout, minutes: number) {
  if (minutes >= 24 * 60) return rows.total;
  const h = hourOf(minutes);
  return rows.tops[h] + ((minutes - h * 60) / 60) * rows.heights[h];
}

/** Minute-of-day under a pixel offset (inverse of yOfMinutes). */
function minutesOfY(rows: RowLayout, y: number) {
  if (y <= 0) return 0;
  if (y >= rows.total) return 24 * 60;
  let h = 23;
  while (h > 0 && rows.tops[h] > y) h -= 1;
  return h * 60 + ((y - rows.tops[h]) / rows.heights[h]) * 60;
}

type Item =
  | { kind: "event"; minutes: number; event: CalendarEvent }
  | { kind: "slot"; minutes: number; slot: OpenQueueSlot };

/** Items of one day bucketed by hour, time-ordered (posts before slots on ties). */
function bucketByHour(events: CalendarEvent[], slots: OpenQueueSlot[]): Item[][] {
  const buckets: Item[][] = HOURS.map(() => []);
  for (const event of events) buckets[hourOf(event.minutes)].push({ kind: "event", minutes: event.minutes, event });
  for (const slot of slots) buckets[hourOf(slot.minutes)].push({ kind: "slot", minutes: slot.minutes, slot });
  for (const b of buckets) {
    b.sort((a, c) => a.minutes - c.minutes || (a.kind === c.kind ? 0 : a.kind === "event" ? -1 : 1));
  }
  return buckets;
}

function hourLabel(h: number, use24: boolean): string {
  const d = new Date(2000, 0, 1, h);
  return format(d, use24 ? "HH:mm" : "h a");
}

function minutesFromPointer(
  e: { clientY: number; currentTarget: HTMLElement },
  rows: RowLayout,
  step: number,
) {
  const rect = e.currentTarget.getBoundingClientRect();
  const raw = minutesOfY(rows, e.clientY - rect.top);
  const snapped = Math.floor(raw / step) * step;
  return Math.max(0, Math.min(24 * 60 - step, snapped));
}

/** Top of the i-th stacked item (chip or ghost slot) in hour row `h`. */
function itemTop(rows: RowLayout, h: number, i: number) {
  return rows.tops[h] + ROW_PAD + i * (ITEM_H + ITEM_GAP);
}

/**
 * Y of the "now" line. Items stack from the top of their hour row whatever
 * their minute, so a plain minute interpolation can draw an upcoming 9:45
 * post above the 9:30 line (inside the "past" shading). Keep the line
 * between the items already due and the ones still to come.
 */
function nowLineY(rows: RowLayout, bucket: Item[], nowMinutes: number) {
  const h = hourOf(nowMinutes);
  let y = yOfMinutes(rows, nowMinutes);
  const due = bucket.filter((item) => item.minutes <= nowMinutes).length;
  if (due > 0) y = Math.max(y, itemTop(rows, h, due - 1) + ITEM_H + ITEM_GAP / 2);
  if (due < bucket.length) y = Math.min(y, itemTop(rows, h, due) - ITEM_GAP / 2);
  return y;
}

function GhostSlot({
  slot,
  top,
  onDragHover,
}: {
  slot: OpenQueueSlot;
  top: number;
  /** Pointer is over this slot mid-drag (the column hides its time preview). */
  onDragHover: () => void;
}) {
  const { use24, canCreate, createAt, dragging, moveTo } = useCalendar();
  const [over, setOver] = useState(false);
  const label = `Open queue slot, ${timeLabel(slot.wall, use24)}`;
  return (
    <button
      type="button"
      disabled={!canCreate}
      onClick={() => createAt(slot.wall)}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
        onDragHover();
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        moveTo(dragging, slot.wall, slot.slotId);
      }}
      aria-label={canCreate ? `${label}. New post at this time` : label}
      title={dragging ? "Drop to put it in this queue slot" : "Open queue slot. Click to fill"}
      // Hidden until the day column is hovered / a slot is focused, or while
      // a post is being dragged (slots are drop targets). The day drawer
      // always lists them.
      className={cn(
        "absolute inset-x-0.5 z-[2] flex items-center gap-1 overflow-hidden rounded-md border border-dashed border-border bg-bg-elevated px-1.5 text-left text-xs tabular-nums text-text-muted opacity-0 transition-[opacity,background-color] hover:bg-bg-muted hover:text-text group-hover/day:opacity-100 touch:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default disabled:hover:bg-bg-elevated",
        dragging && "opacity-100",
        over && "border-accent bg-accent/10 text-text",
      )}
      style={{ top, height: ITEM_H }}
    >
      {canCreate ? <Plus className="size-3 shrink-0" aria-hidden /> : null}
      <span className="truncate">{chipTimeLabel(slot.wall, use24)}</span>
    </button>
  );
}

function DayColumn({
  day,
  buckets,
  rows,
}: {
  day: Date;
  buckets: Item[][];
  rows: RowLayout;
}) {
  const { nowWall, use24, canCreate, createAt, dragging, moveTo } = useCalendar();
  const [preview, setPreview] = useState<number | null>(null);
  // A drop on a queue slot (or anywhere outside this column) never reaches
  // this column's onDrop, and no dragleave follows a drop, so clear the
  // preview whenever no drag is in progress.
  if (!dragging && preview !== null) setPreview(null);
  const key = dayKeyOf(day);
  const isToday = key === dayKeyOf(nowWall);
  const dayStart = startOfDay(day);
  const isPastDay = dayStart < startOfDay(nowWall);
  const nowMinutes = minutesOf(nowWall);
  const nowY = isToday ? nowLineY(rows, buckets[hourOf(nowMinutes)], nowMinutes) : 0;
  const pastHeight = isPastDay ? rows.total : isToday ? nowY : 0;
  const hidePreview = () => {
    if (preview !== null) setPreview(null);
  };

  const canDropAt = (minutes: number) => atMinutes(day, minutes) > nowWall;

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragging || isPastDay) return;
    const m = minutesFromPointer(e, rows, 15);
    if (!canDropAt(m)) {
      if (preview !== null) setPreview(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (m !== preview) setPreview(m);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const m = preview ?? minutesFromPointer(e, rows, 15);
    setPreview(null);
    if (!dragging || !canDropAt(m)) return;
    e.preventDefault();
    moveTo(dragging, atMinutes(day, m));
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!canCreate) return;
    if ((e.target as HTMLElement).closest("a,button")) return;
    const m = minutesFromPointer(e, rows, 30);
    const wall = atMinutes(day, m);
    if (wall <= nowWall) return;
    createAt(wall);
  };

  return (
    // Clicking empty grid space starts a post at that time (mouse
    // shortcut). Keyboard users get the same from the day drawer.
    <div
      className={cn(
        "group/day relative border-l border-border",
        canCreate && !isPastDay && "cursor-cell",
      )}
      style={{ height: rows.total }}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setPreview(null);
      }}
      onDrop={onDrop}
      aria-label={`${longDayTitle(day)} time grid`}
      role="group"
    >
      {HOURS.map((h) => (
        <div
          key={h}
          aria-hidden
          className="absolute inset-x-0 border-t border-border-subtle first:border-t-0"
          style={{ top: rows.tops[h], height: rows.heights[h] }}
        />
      ))}
      {pastHeight > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 bg-bg-subtle/70"
          style={{ height: pastHeight }}
        />
      ) : null}
      {isToday ? (
        // Under the chips (z-1 vs z-2): chips sit on an opaque backing, so
        // the line passes behind them instead of through their text.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-[1] h-0.5 bg-danger"
          style={{ top: nowY }}
        />
      ) : null}
      {HOURS.flatMap((h) =>
        buckets[h].map((item, i) => {
          const top = itemTop(rows, h, i);
          if (item.kind === "slot") {
            return (
              <GhostSlot
                key={`slot-${item.slot.slotId}-${item.slot.at.getTime()}`}
                slot={item.slot}
                top={top}
                onDragHover={hidePreview}
              />
            );
          }
          return (
            <div
              key={item.event.id}
              className="absolute inset-x-0.5 z-[2] rounded-md bg-bg-elevated"
              style={{ top, height: ITEM_H }}
            >
              <CalendarPostChip event={item.event} className="h-full" />
            </div>
          );
        }),
      )}
      {dragging && preview !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-[3] border-t-2 border-accent"
          style={{ top: yOfMinutes(rows, preview) }}
        >
          <span className="absolute -top-2.5 left-1 rounded bg-accent px-1 text-[10px] font-medium text-accent-foreground">
            {timeLabel(atMinutes(day, preview), use24)}
          </span>
        </div>
      ) : null}
      {isToday ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-1 z-[4] size-2 rounded-full bg-danger"
          style={{ top: nowY - 3 }}
        />
      ) : null}
    </div>
  );
}

export function CalendarWeekView({
  days,
  eventsByDay,
}: {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
}) {
  const { nowWall, use24, openDay, slotsByDay } = useCalendar();
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekKey = dayKeyOf(days[0]);
  const todayKey = dayKeyOf(nowWall);

  const bucketsByDay = days.map((d) => {
    const key = dayKeyOf(d);
    return bucketByHour(eventsByDay.get(key) ?? [], slotsByDay.get(key) ?? []);
  });
  const rows = buildRows(
    HOURS.map((h) => Math.max(0, ...bucketsByDay.map((b) => b[h].length))),
  );

  // Scroll to "now" (this week) or the first post of the week, else 8 AM.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const keys = days.map(dayKeyOf);
    let focusMinutes = 8 * 60;
    if (keys.includes(todayKey)) {
      focusMinutes = minutesOf(nowWall) - 90;
    } else {
      const firsts = keys
        .flatMap((k) => eventsByDay.get(k) ?? [])
        .map((e) => e.minutes);
      if (firsts.length) focusMinutes = Math.min(...firsts) - 60;
    }
    el.scrollTop = Math.max(0, yOfMinutes(rows, Math.max(0, focusMinutes)));
    // Only when the week changes; not on every minute tick or data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border">
        <div aria-hidden />
        {days.map((d) => {
          const key = dayKeyOf(d);
          const isToday = key === todayKey;
          const count = eventsByDay.get(key)?.length ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => openDay(key)}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${longDayTitle(d)}, ${count} post${count === 1 ? "" : "s"}. Open day`}
              className="flex flex-col items-center gap-0.5 border-l border-border px-1 py-2 transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
            >
              <span className="text-xs text-text-muted">{format(d, "EEE")}</span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                  isToday ? "bg-accent text-accent-foreground" : "text-text",
                )}
              >
                {format(d, "d")}
              </span>
            </button>
          );
        })}
      </div>
      <div
        ref={scrollRef}
        className="scroll-touch relative max-h-[calc(100dvh-17rem)] min-h-[420px] overflow-y-auto overscroll-contain"
      >
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height: rows.total }} aria-hidden>
            {HOURS.map((h) =>
              h === 0 ? null : (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums text-text-subtle"
                  style={{ top: rows.tops[h] }}
                >
                  {hourLabel(h, use24)}
                </span>
              ),
            )}
          </div>
          {days.map((d, i) => (
            <DayColumn key={dayKeyOf(d)} day={d} buckets={bucketsByDay[i]} rows={rows} />
          ))}
        </div>
      </div>
    </div>
  );
}
