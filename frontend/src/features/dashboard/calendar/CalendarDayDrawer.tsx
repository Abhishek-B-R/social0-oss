import { useId, useState, type FormEvent, type ReactNode } from "react";
import { startOfDay } from "date-fns";
import { toast } from "sonner";
import { Clock, Plus, RotateCw } from "lucide-react";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  InlineError,
  NetworkIcon,
  networkLabel,
  useAccountHealth,
  useDashboardPath,
  type AccountWithHealth,
} from "@/components/app";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { formatTimezoneLabel } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { publishToast, retryPublications } from "@/features/dashboard/posts/post-actions";
import { useCalendar } from "./calendar-context";
import { CalendarPostCard } from "./CalendarPostChip";
import {
  longDayTitle,
  parseDayKey,
  parseWallInput,
  suggestedCreateWall,
  timeLabel,
  wallInputValue,
  type CalendarEvent,
  type CalendarPublication,
} from "./calendar-model";

function handleOf(pub: CalendarPublication, account?: AccountWithHealth): string {
  if (account) return account.handle;
  return pub.platformUsername ? `@${pub.platformUsername.replace(/^@/, "")}` : networkLabel(pub.platform);
}

const fixBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-2.5 text-xs font-medium text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60 touch:h-10";

/** Quiet action for the healthy path (Move): text, no outline. */
const quietBtn =
  "-mx-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 touch:h-10";

/** Section label: sentence case, count as a plain muted number. */
function SectionLabel({
  id,
  children,
  count,
  tone = "default",
}: {
  id: string;
  children: ReactNode;
  count?: number;
  tone?: "default" | "danger";
}) {
  return (
    <h3
      id={id}
      className={cn(
        "mb-2 flex items-baseline gap-1.5 text-[13px] font-medium",
        tone === "danger" ? "text-danger" : "text-text",
      )}
    >
      {children}
      {count !== undefined ? (
        <span className="text-xs font-normal tabular-nums text-text-muted">{count}</span>
      ) : null}
    </h3>
  );
}

/** One failed delivery: what happened + the fix that matches the error kind. */
function FailedDelivery({
  event,
  pub,
  account,
  canManageConnections,
}: {
  event: CalendarEvent;
  pub: CalendarPublication;
  account?: AccountWithHealth;
  canManageConnections: boolean;
}) {
  const { canCreate, postHref, linkState } = useCalendar();
  const dash = useDashboardPath();
  const invalidate = useInvalidateQueries();
  const [retrying, setRetrying] = useState(false);
  const network = networkLabel(pub.platform);
  const handle = handleOf(pub, account);

  const retry = async () => {
    setRetrying(true);
    try {
      // Same path as Home and Posts: polls when the server returns before the
      // delivery settles, so an empty result is "started", never "sent".
      const t = publishToast(await retryPublications(event.id, [pub.publicationId]));
      toast[t.tone](t.message, { description: t.description });
    } finally {
      setRetrying(false);
      // Home's Needs attention, Posts' Failed tab and the post detail list
      // this delivery too, not just the calendar.
      invalidate();
    }
  };

  let reason: string;
  let fix: ReactNode;
  switch (pub.errorKind) {
    case "reconnect":
      reason = `Sign-in for ${handle} expired.`;
      fix = canManageConnections ? (
        <a
          className={fixBtn}
          href={account?.reconnectHref ?? dash(`connections?account=${pub.connectedAccountId ?? ""}`)}
        >
          Reconnect {network}
        </a>
      ) : (
        <span className="text-xs text-text-muted">Ask an admin to reconnect it.</span>
      );
      break;
    case "content":
      reason = `${network} rejected the post content or media.`;
      fix = canCreate ? (
        <Link className={fixBtn} href={postHref(event.id)} state={linkState}>
          Edit for {network}
        </Link>
      ) : null;
      break;
    case "plan":
      reason = "Your plan or payment blocked this post.";
      fix = (
        <Link className={fixBtn} href={dash("billing")}>
          Check plan
        </Link>
      );
      break;
    default:
      reason = `${network} didn't respond in time.`;
      fix = canCreate ? (
        <button type="button" className={fixBtn} onClick={() => void retry()} disabled={retrying}>
          <RotateCw
            className={cn("size-3.5", retrying && "animate-spin motion-reduce:animate-none")}
            aria-hidden
          />
          {retrying ? "Retrying…" : `Retry ${network}`}
        </button>
      ) : null;
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <NetworkIcon network={pub.platform} size={14} />
      <span className="min-w-0 flex-1 text-xs text-text">
        <span className="font-medium">{handle}</span>{" "}
        <span className="text-text-muted">{reason}</span>
      </span>
      {fix}
    </li>
  );
}

/** Keyboard / touch alternative to dragging: pick a new date and time. */
function MoveForm({ event, onDone }: { event: CalendarEvent; onDone: () => void }) {
  const { moveTo, nowWall, pending } = useCalendar();
  const id = useId();
  const [value, setValue] = useState(() => wallInputValue(event.wall));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const wall = parseWallInput(value);
    if (!wall) {
      setError("Pick a date and time.");
      return;
    }
    if (wall <= nowWall) {
      setError("That time has already passed. Pick a later time.");
      return;
    }
    setError(null);
    moveTo(event, wall);
    onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label htmlFor={id} className="sr-only">
        New date and time
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        min={wallInputValue(nowWall)}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-bg px-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 touch:h-11"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      <Button type="submit" size="sm" disabled={pending.has(event.id)}>
        Move
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      {error ? (
        <p id={`${id}-err`} role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function DayPost({
  event,
  accountsById,
  canManageConnections,
}: {
  event: CalendarEvent;
  accountsById: Map<string, AccountWithHealth>;
  canManageConnections: boolean;
}) {
  const { canMove } = useCalendar();
  const [moving, setMoving] = useState(false);
  const broken = event.brokenAccountIds
    .map((id) => accountsById.get(id))
    .filter((a): a is AccountWithHealth => !!a);
  const hasFailures = event.failed.length > 0;
  const postLevelFailure = event.pill === "failed" && !hasFailures;
  const showMove = canMove && event.movable;

  const body =
    hasFailures || postLevelFailure || broken.length > 0 || showMove ? (
      <div className="space-y-2">
        {postLevelFailure ? (
          <p className="text-xs text-text-muted">
            This post didn't go out. Open it to see what went wrong and retry.
          </p>
        ) : null}
        {hasFailures ? (
          <ul className="space-y-2" aria-label="Failed deliveries">
            {event.failed.map((pub) => (
              <FailedDelivery
                key={pub.publicationId}
                event={event}
                pub={pub}
                account={pub.connectedAccountId ? accountsById.get(pub.connectedAccountId) : undefined}
                canManageConnections={canManageConnections}
              />
            ))}
          </ul>
        ) : null}
        {broken.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
            <NetworkIcon network={a.platform} size={14} />
            <span className="min-w-0 flex-1 text-text-muted">
              <span className="font-medium text-text">{a.handle}</span> needs reconnecting before
              this posts.
            </span>
            {canManageConnections ? (
              <a className={fixBtn} href={a.reconnectHref}>
                Reconnect
              </a>
            ) : null}
          </div>
        ))}
        {showMove ? (
          moving ? (
            <MoveForm event={event} onDone={() => setMoving(false)} />
          ) : (
            <button type="button" className={quietBtn} onClick={() => setMoving(true)}>
              <Clock className="size-3.5" aria-hidden />
              Move to another time
            </button>
          )
        ) : null}
      </div>
    ) : null;

  return <CalendarPostCard event={event}>{body}</CalendarPostCard>;
}

/**
 * Right-side drawer for one day: failures first (with the fix), then the
 * day's posts, open queue slots and "New post at <time>".
 */
export function CalendarDayDrawer({
  dayKey,
  eventsByDay,
  slotsError,
  onRetrySlots,
  onClose,
}: {
  dayKey: string | null;
  eventsByDay: Map<string, CalendarEvent[]>;
  slotsError: boolean;
  onRetrySlots: () => void;
  onClose: () => void;
}) {
  const { tz, use24, nowWall, canCreate, createAt, slotsByDay } = useCalendar();
  const { accounts, canManageConnections } = useAccountHealth();
  // Keep showing the last day while the drawer animates closed.
  const [lastKey, setLastKey] = useState(dayKey);
  if (dayKey && dayKey !== lastKey) setLastKey(dayKey);
  const shownKey = dayKey ?? lastKey;
  const day = parseDayKey(shownKey);
  const open = !!parseDayKey(dayKey);
  const events = shownKey ? (eventsByDay.get(shownKey) ?? []) : [];
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const slots = shownKey ? (slotsByDay.get(shownKey) ?? []) : [];
  const isPast = day ? startOfDay(day) < startOfDay(nowWall) : false;
  const createWall = day && canCreate ? suggestedCreateWall(day, slots, nowWall) : null;
  const failures = events.filter((e) => e.failed.length > 0 || e.pill === "failed");
  const rest = events.filter((e) => !failures.includes(e));

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={day ? longDayTitle(day) : "Day"}
      description={day ? `Times in ${formatTimezoneLabel(tz)}` : undefined}
      width="md"
      footer={
        createWall ? (
          <Button onClick={() => createAt(createWall)}>
            <Plus aria-hidden />
            New post at {timeLabel(createWall, use24)}
          </Button>
        ) : undefined
      }
    >
      {day ? (
        <div className="space-y-5">
          {failures.length > 0 ? (
            <section aria-labelledby="cal-day-failed">
              <SectionLabel id="cal-day-failed" count={failures.length} tone="danger">
                Needs a fix
              </SectionLabel>
              <ul className="space-y-2">
                {failures.map((e) => (
                  <li key={e.id}>
                    <DayPost
                      event={e}
                      accountsById={accountsById}
                      canManageConnections={canManageConnections}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="cal-day-posts">
            <SectionLabel id="cal-day-posts" count={rest.length}>
              {failures.length > 0 ? "Other posts" : "Posts"}
            </SectionLabel>
            {rest.length > 0 ? (
              <ul className="space-y-2">
                {rest.map((e) => (
                  <li key={e.id}>
                    <DayPost
                      event={e}
                      accountsById={accountsById}
                      canManageConnections={canManageConnections}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">
                {isPast ? "Nothing went out this day." : "Nothing planned yet."}
              </p>
            )}
          </section>

          {!isPast ? (
            <section aria-labelledby="cal-day-slots">
              <SectionLabel id="cal-day-slots">Open queue slots</SectionLabel>
              {slotsError ? (
                <InlineError message="Couldn't load your queue slots." onRetry={onRetrySlots} />
              ) : slots.length > 0 ? (
                <ul className="-mx-2">
                  {slots.map((s) => (
                    <li key={`${s.slotId}-${s.at.getTime()}`}>
                      <button
                        type="button"
                        disabled={!canCreate}
                        onClick={() => createAt(s.wall)}
                        aria-label={
                          canCreate
                            ? `Open queue slot, ${timeLabel(s.wall, use24)}. New post in this slot`
                            : `Open queue slot, ${timeLabel(s.wall, use24)}`
                        }
                        className="group/slot flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default disabled:hover:bg-transparent touch:min-h-11"
                      >
                        {canCreate ? (
                          <Plus className="size-3.5 shrink-0 text-text-muted" aria-hidden />
                        ) : null}
                        <span className="font-medium tabular-nums">{timeLabel(s.wall, use24)}</span>
                        {canCreate ? (
                          <span className="ml-auto text-xs text-text-muted opacity-0 transition-opacity group-hover/slot:opacity-100 group-focus-visible/slot:opacity-100 touch:opacity-100">
                            Fill slot
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">
                  No open slots this day.{" "}
                  <SettingsScheduleLink />
                </p>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}

function SettingsScheduleLink() {
  const dash = useDashboardPath();
  return (
    <Link
      href={dash("settings/schedule")}
      className="font-medium text-accent underline-offset-2 hover:underline"
    >
      Edit posting schedule
    </Link>
  );
}
