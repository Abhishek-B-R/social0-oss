import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import {
  ErrorState,
  PageContainer,
  PageHeader,
  Skeleton,
  Tabs,
  openComposer,
  shortcutLabel,
  networkLabel,
  useAccountHealth,
  useDashboardPath,
  useHotkeys,
  useSearchParamState,
  type AccountWithHealth,
} from "@/components/app";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import { formatTimezoneLabel } from "@/lib/date-format";
import { CalendarContext, type CalendarContextValue } from "./calendar-context";
import {
  buildEvents,
  dayKeyOf,
  dayTitle,
  displayTimezone,
  filterByAccount,
  fromWall,
  groupByDay,
  isCalendarView,
  openSlotsByDay,
  parseDayKey,
  periodLabel,
  rangeFor,
  shiftAnchor,
  slotIdAt,
  storedTimezone,
  timeLabel,
  toWall,
  weekRange,
  type CalendarData,
  type CalendarEvent,
  type CalendarView,
} from "./calendar-model";
import { CalendarMonthView } from "./CalendarMonthView";
import { CalendarWeekView } from "./CalendarWeekView";
import { CalendarAgenda } from "./CalendarListView";
import { CalendarDayDrawer } from "./CalendarDayDrawer";
import { useCalendarQuery, useIsMobile, useNow, useQueueSlots } from "./use-calendar-data";
import { useCalendarReschedule } from "./use-calendar-reschedule";

const VIEW_TABS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "list", label: "List" },
];

function CalendarSkeleton() {
  return (
    <PageContainer>
      <div aria-busy aria-label="Loading calendar">
        <div className="mb-5">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-64 rounded-lg" />
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
          <div className="grid grid-cols-7 gap-px bg-border">
            {Array.from({ length: 35 }, (_, i) => (
              <div
                key={i}
                className="min-h-[96px] space-y-1.5 bg-bg-elevated p-1.5 sm:min-h-[116px]"
              >
                <Skeleton className="size-5 rounded-full" />
                {i % 3 === 0 ? <Skeleton className="hidden h-4 w-full sm:block" /> : null}
                {i % 5 === 1 ? <Skeleton className="hidden h-4 w-4/5 sm:block" /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function accountOptionLabel(a: AccountWithHealth): string {
  const suffix = a.health === "expired" ? " (needs reconnect)" : "";
  return `${a.handle} · ${networkLabel(a.platform)}${suffix}`;
}

function CalendarBody({ data, teamId }: { data: CalendarData; teamId: string | null }) {
  const location = useLocation();
  const dash = useDashboardPath();
  const isMobile = useIsMobile();
  const now = useNow();
  const perms = useWorkspaceNavPermissions();
  const canCreate = perms.ready && perms.canCreatePosts;
  const { accounts, broken } = useAccountHealth();
  const slotsQuery = useQueueSlots(true);

  const tz = useMemo(() => displayTimezone(data.timezone), [data.timezone]);
  // Queue slots belong to the workspace owner and the server reads their
  // hour/minute in the owner's zone, which a teammate's own zone may not be.
  const slotTz = useMemo(
    () => storedTimezone(data.queueTimezone) ?? storedTimezone(data.timezone) ?? "UTC",
    [data.queueTimezone, data.timezone],
  );
  const use24 = data.use24HourTimeFormat;
  const nowWall = useMemo(() => toWall(now, tz), [now, tz]);
  const nowMs = now.getTime();

  // ---- URL state -------------------------------------------------------
  const [viewParam, setViewParam] = useSearchParamState<string>("view", "");
  const [dateParam, setDateParam] = useSearchParamState<string>("date", "");
  const [dayParam, setDayParam] = useSearchParamState<string>("day", "");
  const [accountParam, setAccountParam] = useSearchParamState<string>("account", "");

  const view: CalendarView = isCalendarView(viewParam)
    ? viewParam
    : isMobile
      ? "list"
      : "month";
  const todayKey = dayKeyOf(nowWall);
  const anchor = parseDayKey(dateParam) ?? startOfDay(nowWall);
  const range = rangeFor(view, anchor);
  const drawerDay = parseDayKey(dayParam);
  const drawerKey = drawerDay ? dayKeyOf(drawerDay) : null;
  const account = accountParam || null;

  // ---- Events ----------------------------------------------------------
  const brokenIds = useMemo(() => new Set(broken.map((a) => a.id)), [broken]);
  const allEvents = useMemo(
    () => buildEvents(data.posts, { tz, nowMs, brokenAccountIds: brokenIds }),
    [data.posts, tz, nowMs, brokenIds],
  );
  const events = useMemo(() => filterByAccount(allEvents, account), [allEvents, account]);
  const eventsByDay = useMemo(() => groupByDay(events), [events]);

  // ---- Queue slots -----------------------------------------------------
  const slotRows = slotsQuery.data;
  const slotsByDay = openSlotsByDay(slotRows, allEvents, {
    fromKey: dayKeyOf(range.start),
    toKey: dayKeyOf(range.end),
    extraDayKey: drawerKey,
    displayTz: tz,
    slotTz,
    nowMs,
  });

  // ---- Actions ---------------------------------------------------------
  const [dragging, setDraggingState] = useState<CalendarEvent | null>(null);
  const setDragging = useCallback((e: CalendarEvent | null) => setDraggingState(e), []);

  // A chip can unmount mid-drag (optimistic move re-renders the grid), which
  // skips its dragend. Clear the drag state on any drag end/drop.
  useEffect(() => {
    const clear = () => setDraggingState(null);
    document.addEventListener("dragend", clear);
    document.addEventListener("drop", clear);
    return () => {
      document.removeEventListener("dragend", clear);
      document.removeEventListener("drop", clear);
    };
  }, []);

  const describe = useCallback(
    (at: Date) => {
      const wall = toWall(at, tz);
      return `${dayTitle(wall)}, ${timeLabel(wall, use24)}`;
    },
    [tz, use24],
  );
  const slotFor = useCallback(
    (at: Date) => (slotRows ? slotIdAt(slotRows, at, slotTz) : null),
    [slotRows, slotTz],
  );
  const { move, pending } = useCalendarReschedule({
    teamId,
    describe,
    slotIdAt: slotFor,
  });

  const moveTo = useCallback(
    (event: CalendarEvent, wall: Date, queueSlotId?: string | null) => {
      setDraggingState(null);
      if (!event.movable) return;
      void move({
        postId: event.id,
        from: event.at,
        to: fromWall(wall, tz),
        queueSlotId: queueSlotId ?? null,
      });
    },
    [move, tz],
  );

  const createAt = useCallback(
    (wall: Date) => {
      setDayParam(null);
      const at = fromWall(wall, tz);
      openComposer({
        scheduledAt: at.toISOString(),
        // An open queue slot at that time: book the slot, not just the time.
        queueSlotId: slotFor(at) ?? undefined,
        accounts: account ? [account] : undefined,
      });
    },
    [tz, account, setDayParam, slotFor],
  );

  const openDay = useCallback((key: string) => setDayParam(key), [setDayParam]);

  const goToday = useCallback(() => setDateParam(null), [setDateParam]);
  const shift = (dir: 1 | -1) => {
    const key = dayKeyOf(shiftAnchor(view, anchor, dir));
    setDateParam(key === todayKey ? null : key);
  };
  const setView = useCallback(
    (v: CalendarView) => setViewParam(v),
    [setViewParam],
  );

  // Page keys. Skip when another binding already took the key (e.g. the
  // global "g p" sequence ends in "p").
  const pageKey = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    fn();
  };
  useHotkeys([
    { keys: "t", handler: pageKey(goToday), preventDefault: false },
    { keys: "n", handler: pageKey(() => shift(1)), preventDefault: false },
    { keys: "p", handler: pageKey(() => shift(-1)), preventDefault: false },
    { keys: "m", handler: pageKey(() => setView("month")), preventDefault: false },
    { keys: "w", handler: pageKey(() => setView("week")), preventDefault: false },
    { keys: "l", handler: pageKey(() => setView("list")), preventDefault: false },
  ]);

  const from = `${location.pathname}${location.search}`;
  const linkState = useMemo(() => ({ from }), [from]);
  const postHref = useCallback((id: string) => dash(`posts/${id}`), [dash]);

  const ctx: CalendarContextValue = {
    tz,
    use24,
    dateFormat: data.dateFormat,
    nowWall,
    canCreate,
    canMove: canCreate,
    dragging,
    setDragging,
    pending,
    moveTo,
    createAt,
    openDay,
    postHref,
    linkState,
    slotsByDay,
  };

  const knownAccount = !account || accounts.some((a) => a.id === account);
  const prevLabel = view === "week" ? "Previous week" : "Previous month";
  const nextLabel = view === "week" ? "Next week" : "Next month";

  return (
    <CalendarContext.Provider value={ctx}>
      <PageContainer className="flex min-h-0 flex-1 flex-col">
        <PageHeader
          title={periodLabel(view, anchor)}
          actions={
            canCreate ? (
              <Button
                onClick={() => openComposer({ accounts: account ? [account] : undefined })}
                title={`New post (${shortcutLabel("c")})`}
              >
                <Plus aria-hidden />
                New post
              </Button>
            ) : null
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={goToday}
                title={`Today (${shortcutLabel("t")})`}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => shift(-1)}
                aria-label={prevLabel}
                title={`${prevLabel} (${shortcutLabel("p")})`}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => shift(1)}
                aria-label={nextLabel}
                title={`${nextLabel} (${shortcutLabel("n")})`}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {accounts.length > 0 ? (
                <label className="relative inline-flex">
                  <span className="sr-only">Filter by account</span>
                  <select
                    value={account ?? ""}
                    onChange={(e) => setAccountParam(e.target.value || null)}
                    className="h-8 max-w-[14rem] cursor-pointer appearance-none truncate rounded-lg border border-border bg-bg-elevated py-0 pl-3 pr-8 text-[13px] text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 touch:h-10"
                  >
                    <option value="">All accounts</option>
                    {!knownAccount ? <option value={account!}>Selected account</option> : null}
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {accountOptionLabel(a)}
                      </option>
                    ))}
                  </select>
                  <ChevronRight
                    className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-text-muted"
                    aria-hidden
                  />
                </label>
              ) : null}
              <Tabs
                items={VIEW_TABS}
                value={view}
                onChange={setView}
                variant="pill"
                aria-label="Calendar view"
              />
            </div>
          </div>
        </PageHeader>

        {view === "month" ? (
          <CalendarMonthView
            days={range.days}
            anchor={anchor}
            eventsByDay={eventsByDay}
            compact={isMobile}
          />
        ) : view === "week" ? (
          isMobile ? (
            <CalendarAgenda
              days={weekRange(anchor).days}
              eventsByDay={eventsByDay}
              showStrip={false}
              showEmptyDays
              emptyTitle="Nothing this week"
            />
          ) : (
            <CalendarWeekView days={range.days} eventsByDay={eventsByDay} />
          )
        ) : (
          <CalendarAgenda
            days={range.days}
            eventsByDay={eventsByDay}
            showStrip
            showEmptyDays={false}
            emptyTitle={`Nothing in ${periodLabel("month", anchor)}${account ? " for this account" : ""}`}
          />
        )}

        {/* Dragging is explained by each movable post's tooltip. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
          <span>Times in {formatTimezoneLabel(tz)}</span>
          <Link href={dash("posts")} className="hover:text-text hover:underline">
            All posts
          </Link>
        </div>
      </PageContainer>

      <CalendarDayDrawer
        dayKey={drawerKey}
        eventsByDay={eventsByDay}
        slotsError={slotsQuery.isError}
        onRetrySlots={() => void slotsQuery.refetch()}
        onClose={() => setDayParam(null)}
      />
    </CalendarContext.Provider>
  );
}

export function CalendarPage() {
  const { session, sessionPending, teamId, query } = useCalendarQuery();
  const result = query.data;

  if (sessionPending || (session && query.isLoading && !result)) {
    return <CalendarSkeleton />;
  }

  if (!session || (result && !result.ok && result.error === "Unauthorized")) {
    return (
      <GuestPostsPageView
        pageTitle="Calendar"
        promptTitle="Sign in to see your calendar"
        promptDescription="Your calendar will show scheduled and published posts once you sign in."
      />
    );
  }

  if (query.isError || (result && !result.ok) || !result) {
    const detail =
      result && !result.ok
        ? result.error
        : query.error instanceof Error
          ? query.error.message
          : null;
    return (
      <PageContainer>
        <PageHeader title="Calendar" />
        <ErrorState
          message="Couldn't load your calendar."
          detail={detail}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }

  return <CalendarBody data={result.data} teamId={teamId} />;
}
