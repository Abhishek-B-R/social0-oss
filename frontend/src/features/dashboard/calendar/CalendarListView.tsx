import { format } from "date-fns";
import { Plus } from "lucide-react";
import { EmptyState, openComposer } from "@/components/app";
import { cn } from "@/lib/utils";
import { useCalendar } from "./calendar-context";
import { CalendarPostCard } from "./CalendarPostChip";
import {
  dayKeyOf,
  dayTitle,
  longDayTitle,
  suggestedCreateWall,
  timeLabel,
  type CalendarEvent,
} from "./calendar-model";

function dayGroupId(key: string) {
  return `calendar-day-${key}`;
}

/**
 * Posts-per-day bars for the visible range so gaps stand out. Clicking a bar
 * jumps to that day in the list (or opens the day when it has no posts).
 */
function VolumeStrip({
  days,
  eventsByDay,
}: {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
}) {
  const { nowWall, openDay } = useCalendar();
  const todayKey = dayKeyOf(nowWall);
  const counts = days.map((d) => eventsByDay.get(dayKeyOf(d))?.length ?? 0);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const empty = counts.filter((c) => c === 0).length;

  const jump = (key: string) => {
    const el = document.getElementById(dayGroupId(key));
    if (el) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    } else {
      openDay(key);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2 text-xs text-text-muted">
        <span>
          <span className="font-medium text-text">{total}</span> post{total === 1 ? "" : "s"}
        </span>
        <span>
          {empty} empty day{empty === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex h-10 items-end gap-[3px]" aria-hidden>
        {days.map((d, i) => {
          const key = dayKeyOf(d);
          const c = counts[i];
          return (
            <button
              key={key}
              type="button"
              tabIndex={-1}
              onClick={() => jump(key)}
              title={`${dayTitle(d)}: ${c} post${c === 1 ? "" : "s"}`}
              className="group/bar flex h-full min-w-0 flex-1 items-end"
            >
              <span
                className={cn(
                  "block w-full rounded-sm transition-colors",
                  c === 0
                    ? "h-1 bg-border group-hover/bar:bg-text-subtle"
                    : "bg-accent/70 group-hover/bar:bg-accent",
                  key === todayKey && "ring-2 ring-accent/40 ring-offset-1 ring-offset-bg",
                )}
                style={c === 0 ? undefined : { height: `${Math.max(18, (c / max) * 100)}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-text-subtle" aria-hidden>
        <span>{format(days[0], "MMM d")}</span>
        <span>{format(days[days.length - 1], "MMM d")}</span>
      </div>
    </div>
  );
}

/**
 * Agenda grouped by day. Used for the List view (a month, with the volume
 * strip) and for Week on phones (seven days, every day shown).
 */
export function CalendarAgenda({
  days,
  eventsByDay,
  showStrip,
  showEmptyDays,
  emptyTitle,
}: {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
  showStrip: boolean;
  /** Render every day, including ones without posts (week agenda). */
  showEmptyDays: boolean;
  emptyTitle: string;
}) {
  const { nowWall, use24, canCreate, createAt, openDay, slotsByDay } = useCalendar();
  const todayKey = dayKeyOf(nowWall);
  const visible = days.filter((d) => {
    const key = dayKeyOf(d);
    return showEmptyDays || key === todayKey || (eventsByDay.get(key)?.length ?? 0) > 0;
  });
  const anyPosts = days.some((d) => (eventsByDay.get(dayKeyOf(d))?.length ?? 0) > 0);

  return (
    <div className="space-y-4">
      {showStrip ? <VolumeStrip days={days} eventsByDay={eventsByDay} /> : null}
      {!anyPosts && !showEmptyDays ? (
        <EmptyState
          compact
          title={emptyTitle}
          primaryAction={
            canCreate ? { label: "New post", onClick: () => openComposer() } : undefined
          }
        />
      ) : null}
      {visible.map((d) => {
        const key = dayKeyOf(d);
        const events = eventsByDay.get(key) ?? [];
        if (!anyPosts && !showEmptyDays && events.length === 0) return null;
        const isToday = key === todayKey;
        const createWall = canCreate
          ? suggestedCreateWall(d, slotsByDay.get(key) ?? [], nowWall)
          : null;
        return (
          <section
            key={key}
            id={dayGroupId(key)}
            aria-label={longDayTitle(d)}
            className="scroll-mt-4"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => openDay(key)}
                className="inline-flex items-baseline gap-2 rounded-md text-sm font-medium text-text hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {isToday ? <span className="text-accent">Today</span> : null}
                {format(d, "EEEE d MMM")}
                <span className="text-xs font-normal text-text-muted">
                  {events.length > 0
                    ? `${events.length} post${events.length === 1 ? "" : "s"}`
                    : ""}
                </span>
              </button>
              {createWall ? (
                <button
                  type="button"
                  onClick={() => createAt(createWall)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-text-muted hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 touch:h-10"
                  aria-label={`New post on ${longDayTitle(d)} at ${timeLabel(createWall, use24)}`}
                >
                  <Plus className="size-3.5" aria-hidden />
                  {timeLabel(createWall, use24)}
                </button>
              ) : null}
            </div>
            {events.length > 0 ? (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id}>
                    <CalendarPostCard event={e} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">
                Nothing {isToday ? "today" : "this day"} yet.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
