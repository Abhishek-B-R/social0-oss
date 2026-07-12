
import { useState, useMemo, useEffect } from "react";
import Link from "@/components/AppLink";
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
  isToday,
  parseISO,
  startOfDay,
} from "date-fns";
import { formatDate } from "@social0/shared/browser";
import { AccountAvatar } from "@/components/AccountAvatar";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  LayoutGrid,
  CalendarDays,
} from "lucide-react";

export type PostForCalendar = {
  id: string;
  snippet: string;
  status: string;
  displayDate: string;
  platform: string | null;
  profileImageUrl: string | null;
  platformUsername: string | null;
  isTwitterPremium?: boolean | null;
};

const MAX_VISIBLE_PER_DAY = 2;
const MOBILE_BREAKPOINT_PX = 768;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(mq.matches);
    const listener = () => setIsMobile(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return isMobile;
}

function sortPostsByTime(posts: PostForCalendar[]) {
  return posts
    .slice()
    .sort(
      (a, b) =>
        new Date(a.displayDate).getTime() - new Date(b.displayDate).getTime(),
    );
}

function CalendarPostListItem({
  post,
  use24HourTimeFormat,
}: {
  post: PostForCalendar;
  use24HourTimeFormat: boolean;
}) {
  return (
    <Link
      href={`/dashboard/posts/${post.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3 shadow-sm hover:bg-bg-muted sm:gap-4 sm:p-4"
    >
      <span className="shrink-0 text-sm font-medium text-text-muted tabular-nums">
        {format(
          parseISO(post.displayDate),
          use24HourTimeFormat ? "HH:mm" : "h:mm a",
        )}
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
        isTwitterPremium={post.isTwitterPremium ?? false}
        size="md"
      />
    </Link>
  );
}

function DayCell({
  date,
  posts,
  isCurrentMonth,
  expandedDay,
  onToggleExpand,
  onDayClick,
  fillHeight,
  use24HourTimeFormat = false,
  isMobile = false,
}: {
  date: Date;
  posts: PostForCalendar[];
  isCurrentMonth: boolean;
  expandedDay: string | null;
  onToggleExpand: (key: string) => void;
  onDayClick?: (date: Date) => void;
  fillHeight?: boolean;
  use24HourTimeFormat?: boolean;
  isMobile?: boolean;
}) {
  const dateKey = format(date, "yyyy-MM-dd");
  const isExpanded = expandedDay === dateKey;
  const mobileLimit = 1;
  const limit = isMobile
    ? mobileLimit
    : fillHeight
      ? posts.length
      : MAX_VISIBLE_PER_DAY;
  const visible = isExpanded ? posts : posts.slice(0, limit);
  const moreCount = isMobile
    ? Math.max(0, posts.length - 1)
    : posts.length - MAX_VISIBLE_PER_DAY;
  const hasMore =
    !fillHeight && !isExpanded && (isMobile ? posts.length > 1 : moreCount > 0);

  // Mobile (month + week): show date + one dot per post by status (green=published, blue=scheduled, purple=partial, red=failed)
  const mobileCompactCell = isMobile && !fillHeight;
  const countPublished = posts.filter((p) => p.status === "published").length;
  const countScheduled = posts.filter((p) => p.status === "scheduled").length;
  const countPartial = posts.filter((p) => p.status === "partial").length;
  const countFailed = posts.filter((p) => p.status === "failed").length;
  const hasAnyDots =
    countPublished > 0 ||
    countScheduled > 0 ||
    countPartial > 0 ||
    countFailed > 0;

  if (mobileCompactCell) {
    return (
      <div
        className={`flex min-h-[72px] flex-col border border-border p-1.5 ${
          fillHeight ? "min-h-0 flex-1" : "sm:min-h-[100px]"
        } ${
          isCurrentMonth ? "bg-bg" : "bg-bg-subtle"
        } ${isToday(date) ? "bg-accent/10" : ""}`}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          {onDayClick ? (
            <button
              type="button"
              onClick={() => onDayClick(date)}
              className="rounded text-sm font-medium text-text hover:bg-bg-muted hover:text-accent"
            >
              {format(date, "d")}
            </button>
          ) : (
            <span className="text-sm font-medium text-text">
              {format(date, "d")}
            </span>
          )}
          {hasAnyDots && (
            <div
              className="flex flex-wrap items-center justify-center gap-0.5 max-w-full"
              aria-hidden
            >
              {Array.from({ length: countPublished }).map((_, i) => (
                <span
                  key={`pub-${i}`}
                  className="h-2 w-2 shrink-0 rounded-full bg-accent"
                  title={`${countPublished} published`}
                />
              ))}
              {Array.from({ length: countScheduled }).map((_, i) => (
                <span
                  key={`sched-${i}`}
                  className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
                  title={`${countScheduled} scheduled`}
                />
              ))}
              {Array.from({ length: countPartial }).map((_, i) => (
                <span
                  key={`part-${i}`}
                  className="h-2 w-2 shrink-0 rounded-full bg-violet-500"
                  title={`${countPartial} partial`}
                />
              ))}
              {Array.from({ length: countFailed }).map((_, i) => (
                <span
                  key={`fail-${i}`}
                  className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                  title={`${countFailed} failed`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

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
      <div
        className={`mt-1 space-y-1 ${fillHeight ? "min-h-0 flex-1 overflow-auto" : ""}`}
      >
        {visible.length === 0 && (
          <p className="text-xs text-text-muted">No posts</p>
        )}
        {isMobile && posts.length > 0 ? (
          <>
            {!isExpanded && (
              <Link
                href={`/dashboard/posts/${posts[0].id}`}
                className="inline-flex items-center gap-1 rounded border border-border-subtle bg-bg px-1.5 py-0.5 text-[10px] font-medium text-text-muted shadow-sm hover:bg-bg-muted"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    posts[0].status === "published"
                      ? "bg-accent"
                      : "bg-accent/70"
                  }`}
                  aria-hidden
                />
                {posts[0].status === "published" ? "Posted" : "Scheduled"}
              </Link>
            )}
            {isExpanded &&
              visible.map((post) => (
                <Link
                  key={post.id}
                  href={`/dashboard/posts/${post.id}`}
                  className="block rounded border border-border-subtle bg-bg p-1.5 shadow-sm hover:bg-bg-muted"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted tabular-nums">
                      {format(
                        parseISO(post.displayDate),
                        use24HourTimeFormat ? "HH:mm" : "h:mm a",
                      )}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        post.status === "published"
                          ? "bg-accent/20 text-accent"
                          : "bg-bg-muted text-text-muted"
                      }`}
                    >
                      {post.status === "published" ? "Posted" : "Scheduled"}
                    </span>
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
          </>
        ) : (
          <>
            {visible.map((post) => (
              <Link
                key={post.id}
                href={`/dashboard/posts/${post.id}`}
                className="block rounded border border-border-subtle bg-bg p-1.5 shadow-sm hover:bg-bg-muted"
              >
                <div className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text line-clamp-1">
                      {post.snippet || "(No caption)"}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {format(
                        parseISO(post.displayDate),
                        use24HourTimeFormat ? "HH:mm" : "h:mm a",
                      )}
                    </p>
                  </div>
                  <AccountAvatar
                    profileImageUrl={post.profileImageUrl}
                    username={post.platformUsername}
                    platform={post.platform ?? undefined}
                    isTwitterPremium={post.isTwitterPremium ?? false}
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
          </>
        )}
      </div>
    </div>
  );
}

const WEEK_STARTS_ON = 1; // Monday

export function CalendarGrid({
  posts,
  initialMonth,
  use24HourTimeFormat = false,
  dateFormat = "dd/MM/yyyy",
  timezone,
}: {
  posts: PostForCalendar[];
  initialMonth: string;
  use24HourTimeFormat?: boolean;
  dateFormat?: string | null;
  timezone?: string | null;
}) {
  const isMobile = useIsMobile();
  const today = startOfDay(new Date());
  const [currentMonth, setCurrentMonth] = useState(() =>
    parseISO(initialMonth + "-01"),
  );
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => today);
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }),
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
          new Date(a.displayDate).getTime() - new Date(b.displayDate).getTime(),
      );
    }
    return map;
  }, [posts]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, {
    weekStartsOn: WEEK_STARTS_ON,
  });
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
      isSameMonth(today, currentMonth) ? today : startOfDay(monthStart),
    );
  };
  const selectDay = (date: Date) => {
    setSelectedDate(date);
    setView("day");
  };

  const handlePrev = () => {
    if (view === "week") {
      goPrevWeek();
      setCurrentMonth(() => startOfMonth(subDays(weekStart, 7)));
    } else if (view === "day") {
      goPrevDay();
    } else {
      setCurrentMonth((m) => subMonths(m, 1));
    }
  };
  const handleNext = () => {
    if (view === "week") {
      goNextWeek();
      setCurrentMonth(() => startOfMonth(addDays(weekStart, 7)));
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
      ? `Week of ${formatDate(weekStart, dateFormat, timezone)} – ${formatDate(addDays(weekStart, 6), dateFormat, timezone)}`
      : view === "day"
        ? `${format(selectedDate, "EEEE")}, ${formatDate(selectedDate, dateFormat, timezone)}`
        : format(currentMonth, "MMMM yyyy");

  const isFullPageView = view === "week" || view === "day";

  return (
    <div
      className={
        isFullPageView
          ? "flex min-h-0 flex-1 flex-col gap-3 sm:gap-4 max-md:min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-13rem)]"
          : "space-y-3 sm:space-y-4"
      }
    >
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-0.5 sm:gap-2">
          <button
            type="button"
            onClick={handlePrev}
            className="rounded-lg p-2 text-text-muted hover:bg-bg-muted touch-manipulation"
            aria-label={
              view === "week"
                ? "Previous week"
                : view === "day"
                  ? "Previous day"
                  : "Previous month"
            }
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-[140px] text-center text-base font-semibold text-text sm:min-w-[180px] sm:text-lg">
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
            className="rounded-lg p-2 text-text-muted hover:bg-bg-muted touch-manipulation"
            aria-label={
              view === "week"
                ? "Next week"
                : view === "day"
                  ? "Next day"
                  : "Next month"
            }
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={switchToMonth}
            className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium touch-manipulation sm:gap-1.5 sm:px-3 sm:text-sm ${
              view === "month"
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:bg-bg-muted"
            }`}
          >
            <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Month
          </button>
          <button
            type="button"
            onClick={handleSwitchToWeek}
            className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium touch-manipulation sm:gap-1.5 sm:px-3 sm:text-sm ${
              view === "week"
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:bg-bg-muted"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Week
          </button>
          <button
            type="button"
            onClick={handleSwitchToDay}
            className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium touch-manipulation sm:gap-1.5 sm:px-3 sm:text-sm ${
              view === "day"
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:bg-bg-muted"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
                className="p-1.5 text-center text-[10px] font-semibold uppercase text-text-muted sm:p-2 sm:text-xs"
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
                use24HourTimeFormat={use24HourTimeFormat}
                isMobile={isMobile}
              />
            ))}
          </div>
          {isMobile && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-border bg-bg-subtle px-3 py-2">
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
                Published
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                Scheduled
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden />
                Partial
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
                Failed
              </span>
            </div>
          )}
        </div>
      )}

      {view === "week" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg">
          {isMobile ? (
            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
              {weekDates.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const dayPosts = sortPostsByTime(postsByDate[dateKey] ?? []);
                return (
                  <section key={day.toISOString()} className="p-3 sm:p-4">
                    <button
                      type="button"
                      onClick={() => selectDay(day)}
                      className={`mb-2 flex w-full items-center justify-between rounded-lg px-1 py-0.5 text-left text-sm font-semibold touch-manipulation ${
                        isToday(day) ? "text-accent" : "text-text"
                      }`}
                    >
                      <span>{format(day, "EEEE, d MMM")}</span>
                      {isToday(day) && (
                        <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                          Today
                        </span>
                      )}
                    </button>
                    {dayPosts.length === 0 ? (
                      <p className="text-xs text-text-muted">No posts</p>
                    ) : (
                      <ul className="space-y-2">
                        {dayPosts.map((post) => (
                          <li key={post.id}>
                            <CalendarPostListItem
                              post={post}
                              use24HourTimeFormat={use24HourTimeFormat}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <>
              <div className="grid shrink-0 grid-cols-7 border-b border-border bg-bg-subtle">
                {weekDates.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="border-r border-border p-1.5 text-center text-[10px] font-semibold uppercase text-text-muted last:border-r-0 sm:p-2 sm:text-xs"
                  >
                    {format(day, "EEE d")}
                  </div>
                ))}
              </div>
              <div
                className="grid min-h-0 flex-1 grid-cols-7"
                style={{ gridTemplateRows: "1fr" }}
              >
                {weekDates.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="flex min-h-0 flex-1 flex-col border-r border-border last:border-r-0"
                  >
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
                      use24HourTimeFormat={use24HourTimeFormat}
                      isMobile={false}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
          {isMobile && (
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-border bg-bg-subtle px-3 py-2">
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
                Published
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                Scheduled
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden />
                Partial
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
                Failed
              </span>
            </div>
          )}
        </div>
      )}

      {view === "day" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg">
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {(() => {
              const dateKey = format(selectedDate, "yyyy-MM-dd");
              const dayPosts = sortPostsByTime(postsByDate[dateKey] ?? []);
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
                      <CalendarPostListItem
                        post={post}
                        use24HourTimeFormat={use24HourTimeFormat}
                      />
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </div>
      )}

      <p className="shrink-0 text-sm text-text-muted">
        <Link
          href="/dashboard/posts"
          className="font-medium text-accent hover:text-accent/90"
        >
          View all posts →
        </Link>
      </p>
    </div>
  );
}
