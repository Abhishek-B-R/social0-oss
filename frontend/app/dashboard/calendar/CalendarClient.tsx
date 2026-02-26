"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addDays,
  subDays,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  startOfDay,
} from "date-fns";
import { AccountAvatar } from "@/components/AccountAvatar";
import { ChevronLeft, ChevronRight, Calendar, LayoutGrid, CalendarDays } from "lucide-react";

export type PostForCalendar = {
  id: string;
  snippet: string;
  status: string;
  displayDate: string;
  platform: string | null;
  profileImageUrl: string | null;
  platformUsername: string | null;
};

const MAX_VISIBLE_PER_DAY = 2;

function DayCell({
  date,
  posts,
  isCurrentMonth,
  expandedDay,
  onToggleExpand,
  onDayClick,
  fillHeight,
}: {
  date: Date;
  posts: PostForCalendar[];
  isCurrentMonth: boolean;
  expandedDay: string | null;
  onToggleExpand: (key: string) => void;
  onDayClick?: (date: Date) => void;
  fillHeight?: boolean;
}) {
  const dateKey = format(date, "yyyy-MM-dd");
  const isExpanded = expandedDay === dateKey;
  const limit = fillHeight ? posts.length : MAX_VISIBLE_PER_DAY;
  const visible = isExpanded ? posts : posts.slice(0, limit);
  const moreCount = posts.length - MAX_VISIBLE_PER_DAY;
  const hasMore = !fillHeight && !isExpanded && moreCount > 0;

  return (
    <div
      className={`border border-border p-2 ${
        fillHeight ? "flex min-h-0 flex-1 flex-col" : "min-h-[100px]"
      } ${
        isCurrentMonth ? "bg-bg" : "bg-bg-subtle"
      } ${isToday(date) ? "bg-accent/10" : ""}`}
    >
      <div className="text-right text-sm font-medium text-text">
        {onDayClick ? (
          <button
            type="button"
            onClick={() => onDayClick(date)}
            className="rounded hover:bg-bg-muted hover:text-accent"
          >
            {format(date, "d")}
          </button>
        ) : (
          format(date, "d")
        )}
      </div>
      <div className={`mt-1 space-y-1 ${fillHeight ? "min-h-0 flex-1 overflow-auto" : ""}`}>
        {visible.length === 0 && (
          <p className="text-xs text-text-muted">No posts</p>
        )}
        {visible.map((post) => (
          <Link
            key={post.id}
            href="/dashboard/posts"
            className="block rounded border border-border-subtle bg-bg p-1.5 shadow-sm hover:bg-bg-muted"
          >
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text line-clamp-1">
                  {post.snippet || "(No caption)"}
                </p>
                <p className="text-[10px] text-text-muted">
                  {format(parseISO(post.displayDate), "h:mm a")}
                </p>
              </div>
              <AccountAvatar
                profileImageUrl={post.profileImageUrl}
                username={post.platformUsername}
                platform={post.platform ?? undefined}
                size="sm"
              />
            </div>
          </Link>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => onToggleExpand(dateKey)}
            className="w-full rounded border border-dashed border-border py-1 text-xs font-medium text-accent hover:bg-accent/10"
          >
            +{moreCount} more
          </button>
        )}
        {isExpanded && moreCount > 0 && (
          <button
            type="button"
            onClick={() => onToggleExpand(dateKey)}
            className="w-full text-xs text-text-muted hover:text-text"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

const WEEK_STARTS_ON = 1; // Monday

export function CalendarClient({
  posts,
  initialMonth,
}: {
  posts: PostForCalendar[];
  initialMonth: string;
}) {
  const today = startOfDay(new Date());
  const [currentMonth, setCurrentMonth] = useState(() =>
    parseISO(initialMonth + "-01")
  );
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => today);
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON })
  );

  const postsByDate = useMemo(() => {
    const map: Record<string, PostForCalendar[]> = {};
    for (const post of posts) {
      const key = post.displayDate.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    for (const key of Object.keys(map)) {
      map[key].sort(
        (a, b) =>
          new Date(a.displayDate).getTime() - new Date(b.displayDate).getTime()
      );
    }
    return map;
  }, [posts]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON });
  const days: Date[] = [];
  let d = calendarStart;
  while (d <= calendarEnd) {
    days.push(d);
    d = addDays(d, 1);
  }
  const weekDays = days.slice(0, 7);

  const weekDates: Date[] = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) out.push(addDays(weekStart, i));
    return out;
  }, [weekStart]);

  const goPrevWeek = () => setWeekStart((w) => subDays(w, 7));
  const goNextWeek = () => setWeekStart((w) => addDays(w, 7));
  const goPrevDay = () => setSelectedDate((d) => subDays(d, 1));
  const goNextDay = () => setSelectedDate((d) => addDays(d, 1));

  const handleSwitchToWeek = () => {
    setView("week");
    setWeekStart(startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }));
  };
  const handleSwitchToDay = () => {
    setView("day");
    setSelectedDate(
      isSameMonth(today, currentMonth) ? today : startOfDay(monthStart)
    );
  };
  const selectDay = (date: Date) => {
    setSelectedDate(date);
    setView("day");
  };

  const handlePrev = () => {
    if (view === "week") {
      goPrevWeek();
      setCurrentMonth((m) => startOfMonth(subDays(weekStart, 7)));
    } else if (view === "day") {
      goPrevDay();
    } else {
      setCurrentMonth((m) => subMonths(m, 1));
    }
  };
  const handleNext = () => {
    if (view === "week") {
      goNextWeek();
      setCurrentMonth((m) => startOfMonth(addDays(weekStart, 7)));
    } else if (view === "day") {
      goNextDay();
    } else {
      setCurrentMonth((m) => addMonths(m, 1));
    }
  };

  const switchToMonth = () => {
    if (view === "week") setCurrentMonth(startOfMonth(weekStart));
    if (view === "day") setCurrentMonth(startOfMonth(selectedDate));
    setView("month");
  };

  const headerTitle =
    view === "week"
      ? `Week of ${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`
      : view === "day"
        ? format(selectedDate, "EEEE, MMM d, yyyy")
        : format(currentMonth, "MMMM yyyy");

  const isFullPageView = view === "week" || view === "day";

  return (
    <div
      className={
        isFullPageView
          ? "flex min-h-0 flex-1 flex-col gap-4"
          : "space-y-4"
      }
    >
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            className="rounded-lg p-2 text-text-muted hover:bg-bg-muted"
            aria-label={view === "week" ? "Previous week" : view === "day" ? "Previous day" : "Previous month"}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-[180px] text-center text-lg font-semibold text-text">
            {headerTitle}
            {view === "day" && isToday(selectedDate) && (
              <span className="ml-2 rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                Today
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={handleNext}
            className="rounded-lg p-2 text-text-muted hover:bg-bg-muted"
            aria-label={view === "week" ? "Next week" : view === "day" ? "Next day" : "Next month"}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={switchToMonth}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              view === "month" ? "bg-accent/15 text-accent" : "text-text-muted hover:bg-bg-muted"
            }`}
          >
            <Calendar className="h-4 w-4" />
            Month
          </button>
          <button
            type="button"
            onClick={handleSwitchToWeek}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              view === "week" ? "bg-accent/15 text-accent" : "text-text-muted hover:bg-bg-muted"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Week
          </button>
          <button
            type="button"
            onClick={handleSwitchToDay}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              view === "day" ? "bg-accent/15 text-accent" : "text-text-muted hover:bg-bg-muted"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            Day
          </button>
        </div>
      </div>

      {view === "month" && (
        <div className="overflow-hidden rounded-xl border border-border bg-bg">
          <div className="grid grid-cols-7 border-b border-border bg-bg-subtle">
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className="p-2 text-center text-xs font-semibold uppercase text-text-muted"
              >
                {format(day, "EEE")}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => (
              <DayCell
                key={day.toISOString()}
                date={day}
                posts={postsByDate[format(day, "yyyy-MM-dd")] ?? []}
                isCurrentMonth={isSameMonth(day, currentMonth)}
                expandedDay={expandedDay}
                onToggleExpand={(key) =>
                  setExpandedDay((prev) => (prev === key ? null : key))
                }
                onDayClick={selectDay}
              />
            ))}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg">
          <div className="grid grid-cols-7 shrink-0 border-b border-border bg-bg-subtle">
            {weekDates.map((day) => (
              <div
                key={day.toISOString()}
                className="border-r border-border p-2 text-center text-xs font-semibold uppercase text-text-muted last:border-r-0"
              >
                {format(day, "EEE d")}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: "1fr" }}>
            {weekDates.map((day) => (
              <div key={day.toISOString()} className="flex min-h-0 flex-1 flex-col border-r border-border last:border-r-0">
                <DayCell
                  date={day}
                  posts={postsByDate[format(day, "yyyy-MM-dd")] ?? []}
                  isCurrentMonth={isSameMonth(day, currentMonth)}
                  expandedDay={expandedDay}
                  onToggleExpand={(key) =>
                    setExpandedDay((prev) => (prev === key ? null : key))
                  }
                  onDayClick={selectDay}
                  fillHeight
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "day" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg">
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {(() => {
              const dateKey = format(selectedDate, "yyyy-MM-dd");
              const dayPosts = (postsByDate[dateKey] ?? []).slice();
              dayPosts.sort(
                (a, b) =>
                  new Date(a.displayDate).getTime() - new Date(b.displayDate).getTime()
              );
              if (dayPosts.length === 0) {
                return (
                  <p className="py-8 text-center text-text-muted">
                    No posts scheduled or published on this day.
                  </p>
                );
              }
              return (
                <ul className="space-y-3">
                  {dayPosts.map((post) => (
                    <li key={post.id}>
                      <Link
                        href="/dashboard/posts"
                        className="flex items-center gap-4 rounded-xl border border-border bg-bg p-4 shadow-sm hover:bg-bg-muted"
                      >
                        <span className="shrink-0 text-sm font-medium text-text-muted tabular-nums">
                          {format(parseISO(post.displayDate), "h:mm a")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-text line-clamp-2">
                            {post.snippet || "(No caption)"}
                          </p>
                          <span className="mt-1 inline-block rounded bg-bg-muted px-2 py-0.5 text-xs text-text-muted">
                            {post.status === "published" ? "Posted" : "Scheduled"}
                          </span>
                        </div>
                        <AccountAvatar
                          profileImageUrl={post.profileImageUrl}
                          username={post.platformUsername}
                          platform={post.platform ?? undefined}
                          size="md"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </div>
      )}

      <p className="shrink-0 text-sm text-text-muted">
        <Link href="/dashboard/posts" className="font-medium text-accent hover:text-accent/90">
          View all posts →
        </Link>
      </p>
    </div>
  );
}
