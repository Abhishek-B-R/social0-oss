import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import Link from "@/components/AppLink";
import { Banner, EmptyState, ErrorState, RowActions } from "@/components/app";
import { Button } from "@/components/ui/button";
import { switchWorkspace } from "@/api/team";
import { clearTeamBootstrap, clearTeamBootstrapExcept } from "@/layouts/team-bootstrap";
import { formatTimezoneLabel } from "@/lib/date-format";
import {
  readTeamWorkspaceId,
  writePersonalWorkspaceId,
  writeTeamWorkspaceId,
} from "@/lib/dashboard-base-path";
import { invalidateTeamRoomQueries } from "@/lib/team-query-keys";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useSaveStatus } from "../save-status-context";
import { useSettingsScope } from "../settings-scope";
import { useSettingsData } from "../use-settings-data";
import { SettingsCard, SettingsRowsSkeleton } from "../settings-ui";
import {
  QUEUE_SLOTS_QUERY_KEY,
  WORKSPACE_CONTEXT_QUERY_KEY,
  createQueueSlot,
  deleteQueueSlot,
  getWorkspaceContext,
  listQueueSlots,
  updateQueueSlot,
  type QueueSlot,
} from "../settings-api";

/** Monday first. Values are JS days (0 = Sunday), as the API stores them. */
const DAYS = [
  { d: 1, short: "Mon", full: "Monday" },
  { d: 2, short: "Tue", full: "Tuesday" },
  { d: 3, short: "Wed", full: "Wednesday" },
  { d: 4, short: "Thu", full: "Thursday" },
  { d: 5, short: "Fri", full: "Friday" },
  { d: 6, short: "Sat", full: "Saturday" },
  { d: 0, short: "Sun", full: "Sunday" },
] as const;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MINUTE_STEPS = [0, 15, 30, 45];

function formatTime(hour: number, minute: number, use24h: boolean): string {
  const mm = minute.toString().padStart(2, "0");
  if (use24h) return `${hour.toString().padStart(2, "0")}:${mm}`;
  return `${hour % 12 || 12}:${mm} ${hour < 12 ? "AM" : "PM"}`;
}

function hourLabel(h: number, use24h: boolean) {
  return use24h ? h.toString().padStart(2, "0") : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

const sortSlots = (list: QueueSlot[]) =>
  [...list].sort((a, b) => a.hour - b.hour || a.minute - b.minute);

/**
 * The one posting-schedule editor, for Main and for team workspaces. Weekly
 * times "Add to queue" fills in order. Every change saves on its own.
 * Slots belong to the server's active workspace, so the header says which.
 */
export function PostingScheduleSection() {
  const scope = useSettingsScope();
  const queryClient = useQueryClient();
  const { track } = useSaveStatus();
  const settings = useSettingsData();
  const { data: session } = useSession();
  const slotsQuery = useQuery({ queryKey: QUEUE_SLOTS_QUERY_KEY, queryFn: listQueueSlots });
  const ctxQuery = useQuery({
    queryKey: WORKSPACE_CONTEXT_QUERY_KEY,
    queryFn: getWorkspaceContext,
    staleTime: 30_000,
  });
  const [switching, setSwitching] = useState(false);

  // Run schedule writes one at a time so quick clicks can't land out of order.
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const run = writeChain.current.then(work, work);
    writeChain.current = run.catch(() => undefined);
    // Other pages read the same slots under their own keys (calendar ghost
    // slots, "Add to queue · <next slot>" on Home/composer/posts): refresh them
    // once the write lands. This list keeps its optimistic copy.
    void run
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({
            predicate: (q) => q.queryKey[0] === "queue-slots" && q.queryKey.length > 1,
          }),
          queryClient.invalidateQueries({ queryKey: ["queue-next-slot"] }),
          queryClient.invalidateQueries({ queryKey: ["queue", "next-slot"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard-home"] }),
        ]),
      )
      .catch(() => undefined);
    return track(run);
  }, [track, queryClient]);

  const use24h = settings.data?.settings.use24HourTimeFormat ?? false;
  const ctx = ctxQuery.data;
  const canEdit = !!ctx && (ctx.permissions === null || ctx.permissions.canManageWorkspaceSettings);

  const activeWs = scope.workspacesQuery.data?.workspaces.find((w) => w.isActive);
  const activeName = activeWs?.name ?? "Main";
  // Posting times belong to the account that owns the active workspace (Main
  // and every team you own share yours). Only a different owner is a mismatch.
  const myId = session?.user?.id ?? null;
  const expectedOwner = scope.teamId
    ? (scope.teamQuery?.data?.team?.ownerUserId ?? scope.teamListItem?.ownerUserId ?? null)
    : myId;
  const wrongWorkspace = !!ctx && !!expectedOwner && ctx.resourceOwnerId !== expectedOwner;
  const ownsTeams = (scope.workspacesQuery.data?.teams ?? []).some((t) => t.kind === "owned");
  const sharedNote =
    !wrongWorkspace && ctx?.resourceOwnerId === myId && ownsTeams
      ? " Main and the teams you own share these times."
      : "";
  // Slots run in their owner's timezone (the server reads the resource owner's
  // settings). In a team someone else owns, that zone isn't yours and your
  // General page can't change it.
  const ownerIsMe = !ctx || !myId || ctx.resourceOwnerId === myId;
  const timezone = ownerIsMe
    ? settings.data?.settings.timezone || "UTC"
    : ctx?.resourceOwnerTimezone || "UTC";

  const slots = useMemo(
    () => sortSlots((slotsQuery.data ?? []).filter((s) => s.isActive !== false)),
    [slotsQuery.data],
  );
  const perWeek = slots.reduce((n, s) => n + s.daysOfWeek.length, 0);

  const setSlots = (fn: (prev: QueueSlot[]) => QueueSlot[]) =>
    queryClient.setQueryData<QueueSlot[]>(QUEUE_SLOTS_QUERY_KEY, (prev) => fn(prev ?? []));

  const patchSlot = async (slot: QueueSlot, patch: Partial<QueueSlot>, what: string) => {
    const before = queryClient.getQueryData<QueueSlot[]>(QUEUE_SLOTS_QUERY_KEY);
    setSlots((prev) => sortSlots(prev.map((s) => (s.id === slot.id ? { ...s, ...patch } : s))));
    try {
      const updated = await serial(() => updateQueueSlot(slot.id, patch));
      setSlots((prev) => sortSlots(prev.map((s) => (s.id === slot.id ? { ...s, ...updated } : s))));
    } catch (err) {
      if (before) queryClient.setQueryData(QUEUE_SLOTS_QUERY_KEY, before);
      toast.error(`Couldn't ${what}. Your change was undone.`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const toggleDay = (slot: QueueSlot, day: number) => {
    const on = slot.daysOfWeek.includes(day);
    const next = on
      ? slot.daysOfWeek.filter((d) => d !== day)
      : [...slot.daysOfWeek, day].sort((a, b) => a - b);
    if (next.length === 0) {
      toast("A time needs at least one day", {
        description: "To stop posting at this time, remove it instead.",
      });
      return;
    }
    void patchSlot(slot, { daysOfWeek: next }, "change the days");
  };

  const remove = async (slot: QueueSlot) => {
    const before = queryClient.getQueryData<QueueSlot[]>(QUEUE_SLOTS_QUERY_KEY);
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    try {
      await serial(() => deleteQueueSlot(slot.id));
      toast.success(`Removed ${formatTime(slot.hour, slot.minute, use24h)}`, {
        action: {
          label: "Undo",
          onClick: () => {
            void serial(() =>
              createQueueSlot({ daysOfWeek: slot.daysOfWeek, hour: slot.hour, minute: slot.minute }),
            )
              .then((restored) => setSlots((prev) => sortSlots([...prev.filter((s) => s.id !== restored.id), restored])))
              .catch((err: unknown) =>
                toast.error("Couldn't bring that time back", {
                  description: err instanceof Error ? err.message : "Add it again below.",
                }),
              );
          },
        },
      });
    } catch (err) {
      if (before) queryClient.setQueryData(QUEUE_SLOTS_QUERY_KEY, before);
      toast.error("Couldn't remove that time", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    }
  };

  const switchHere = async () => {
    setSwitching(true);
    try {
      if (scope.teamId) {
        const team = scope.teamListItem;
        const stored = readTeamWorkspaceId(scope.teamId);
        const target =
          (stored && team?.workspaces.some((w) => w.id === stored) ? stored : null) ??
          team?.defaultWorkspaceId ??
          team?.workspaces[0]?.id ??
          null;
        if (!target) throw new Error("This team has no workspaces.");
        await switchWorkspace(target);
        writeTeamWorkspaceId(scope.teamId, target);
        // Any other team's gate is stale now: its URL would render over this
        // team's data. Drop it so TeamAppLayout re-activates that team on entry.
        clearTeamBootstrapExcept(scope.teamId);
      } else {
        await switchWorkspace(null);
        writePersonalWorkspaceId(null);
        // Every team gate is stale once Main is active (see WorkspaceSwitcher).
        clearTeamBootstrap();
      }
      await Promise.all([
        invalidateTeamRoomQueries(queryClient, scope.teamId),
        queryClient.invalidateQueries({ queryKey: QUEUE_SLOTS_QUERY_KEY }),
      ]);
      toast.success(`Switched to ${scope.workspaceName}`);
    } catch (err) {
      toast.error("Couldn't switch workspace", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setSwitching(false);
    }
  };

  if (slotsQuery.isError) {
    return (
      <ErrorState
        message="Couldn't load your posting times."
        detail={slotsQuery.error instanceof Error ? slotsQuery.error.message : undefined}
        onRetry={() => void slotsQuery.refetch()}
        retrying={slotsQuery.isFetching}
      />
    );
  }

  return (
    <div className="space-y-6">
      {wrongWorkspace ? (
        <Banner
          tier="info"
          title={`These times belong to ${activeName}.`}
          actions={
            <Button size="sm" variant="outline" disabled={switching} onClick={() => void switchHere()}>
              {switching ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Switch to {scope.workspaceName}
            </Button>
          }
        >
          Posting times follow the workspace you're working in. Switch to see and edit {scope.workspaceName}'s.
        </Banner>
      ) : null}

      <SettingsCard
        title="Posting times"
        description={
          <>
            Times are in{" "}
            {ownerIsMe ? (
              <Link href={`${scope.settingsBase}/general`} className="font-medium text-text hover:underline">
                {formatTimezoneLabel(timezone)}
              </Link>
            ) : (
              <>
                <span className="font-medium text-text">{formatTimezoneLabel(timezone)}</span>, set by
                the team owner
              </>
            )}
            . &ldquo;Add to queue&rdquo; takes the next free one; changing times doesn&apos;t move posts
            already scheduled.
            {sharedNote}
          </>
        }
        actions={
          slots.length > 0 ? (
            <span className="text-xs text-text-muted">
              {perWeek} {perWeek === 1 ? "post" : "posts"} a week
            </span>
          ) : null
        }
      >
        {slotsQuery.isPending || ctxQuery.isPending ? (
          <SettingsRowsSkeleton rows={3} />
        ) : (
          <>
            {slots.length === 0 ? (
              <EmptyState
                compact
                title="No posting times yet"
                description={
                  canEdit
                    ? "Add one so “Add to queue” knows when to post."
                    : "An admin hasn't set any yet."
                }
                className="border-0 bg-transparent"
              />
            ) : (
              <ul className="divide-y divide-border" aria-label="Posting times">
                {slots.map((slot) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    use24h={use24h}
                    canEdit={canEdit}
                    takenTimes={slots}
                    onToggleDay={(d) => toggleDay(slot, d)}
                    onTime={(hour, minute) =>
                      void patchSlot(slot, { hour, minute }, "change the time")
                    }
                    onRemove={() => void remove(slot)}
                  />
                ))}
              </ul>
            )}
            {canEdit ? (
              <AddTimeRow
                use24h={use24h}
                existing={slots}
                onAdd={async (input) => {
                  const created = await serial(() => createQueueSlot(input));
                  setSlots((prev) => sortSlots([...prev.filter((s) => s.id !== created.id), created]));
                  toast.success(`Added ${formatTime(created.hour, created.minute, use24h)}`);
                }}
              />
            ) : (
              <p className="text-xs text-text-muted">Only admins can change the posting schedule.</p>
            )}
          </>
        )}
      </SettingsCard>
    </div>
  );
}

function DayPills({
  days,
  onToggle,
  disabled,
  label,
}: {
  days: number[];
  onToggle: (day: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {DAYS.map(({ d, short, full }) => {
        const on = days.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={full}
            title={full}
            disabled={disabled}
            onClick={() => onToggle(d)}
            className={cn(
              "h-7 min-w-10 rounded-md px-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default touch:h-9",
              on
                ? "bg-accent/10 text-accent"
                : "text-text-muted hover:text-text enabled:hover:bg-bg-muted",
              disabled && !on && "opacity-60",
            )}
          >
            {short}
          </button>
        );
      })}
    </div>
  );
}

function TimeSelects({
  hour,
  minute,
  use24h,
  onChange,
  disabled,
  idBase,
}: {
  hour: number;
  minute: number;
  use24h: boolean;
  onChange: (hour: number, minute: number) => void;
  disabled?: boolean;
  idBase: string;
}) {
  const minutes = MINUTE_STEPS.includes(minute)
    ? MINUTE_STEPS
    : [...MINUTE_STEPS, minute].sort((a, b) => a - b);
  const cls =
    "h-8 appearance-none rounded-md border border-input bg-bg px-2 text-sm font-medium text-text tabular-nums focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60 touch:h-10";
  return (
    <span className="inline-flex items-center gap-1">
      <label htmlFor={`${idBase}-h`} className="sr-only">
        Hour
      </label>
      <select
        id={`${idBase}-h`}
        value={hour}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value), minute)}
        className={cls}
      >
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {hourLabel(h, use24h)}
          </option>
        ))}
      </select>
      <span aria-hidden className="text-text-muted">
        :
      </span>
      <label htmlFor={`${idBase}-m`} className="sr-only">
        Minute
      </label>
      <select
        id={`${idBase}-m`}
        value={minute}
        disabled={disabled}
        onChange={(e) => onChange(hour, Number(e.target.value))}
        className={cls}
      >
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m.toString().padStart(2, "0")}
          </option>
        ))}
      </select>
    </span>
  );
}

function SlotRow({
  slot,
  use24h,
  canEdit,
  takenTimes,
  onToggleDay,
  onTime,
  onRemove,
}: {
  slot: QueueSlot;
  use24h: boolean;
  canEdit: boolean;
  takenTimes: QueueSlot[];
  onToggleDay: (day: number) => void;
  onTime: (hour: number, minute: number) => void;
  onRemove: () => void;
}) {
  const label = formatTime(slot.hour, slot.minute, use24h);
  return (
    <li className="group/row flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
      <div className="w-36 shrink-0">
        {canEdit ? (
          <TimeSelects
            idBase={`slot-${slot.id}`}
            hour={slot.hour}
            minute={slot.minute}
            use24h={use24h}
            onChange={(h, m) => {
              if (takenTimes.some((s) => s.id !== slot.id && s.hour === h && s.minute === m)) {
                toast.error(`${formatTime(h, m, use24h)} is already in your schedule`, {
                  description: "Pick another time, or add days to that one.",
                });
                return;
              }
              onTime(h, m);
            }}
          />
        ) : (
          <span className="text-sm font-medium text-text tabular-nums">{label}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <DayPills
          days={slot.daysOfWeek}
          onToggle={onToggleDay}
          disabled={!canEdit}
          label={`Days for ${label}`}
        />
      </div>
      {canEdit ? (
        <RowActions>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${label}`}
            title="Remove"
            className="text-text-muted hover:bg-danger-soft hover:text-danger"
            onClick={onRemove}
          >
            <X aria-hidden />
          </Button>
        </RowActions>
      ) : null}
    </li>
  );
}

function AddTimeRow({
  use24h,
  existing,
  onAdd,
}: {
  use24h: boolean;
  existing: QueueSlot[];
  onAdd: (input: { hour: number; minute: number; daysOfWeek: number[] }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [busy, setBusy] = useState(false);
  const taken = existing.some((s) => s.hour === hour && s.minute === minute);

  if (!open) {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-text-muted hover:text-text"
          onClick={() => {
            // Start one hour after the latest time, so repeated adds don't collide.
            const last = existing[existing.length - 1];
            setHour(last ? Math.min(23, last.hour + 1) : 9);
            setMinute(0);
            setDays(ALL_DAYS);
            setOpen(true);
          }}
        >
          <Plus aria-hidden />
          Add time
        </Button>
      </div>
    );
  }

  const submit = async () => {
    if (taken || days.length === 0 || busy) return;
    setBusy(true);
    try {
      await onAdd({ hour, minute, daysOfWeek: days });
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't add that time", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-36 shrink-0">
          <TimeSelects
            idBase="new-slot"
            hour={hour}
            minute={minute}
            use24h={use24h}
            onChange={(h, m) => {
              setHour(h);
              setMinute(m);
            }}
            disabled={busy}
          />
        </div>
        <div className="min-w-0 flex-1">
          <DayPills
            days={days}
            label="Days for the new time"
            disabled={busy}
            onToggle={(d) =>
              setDays((prev) =>
                prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
              )
            }
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || taken || days.length === 0} onClick={() => void submit()}>
          {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {busy ? "Adding…" : "Add"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {taken ? (
          <span className="text-xs text-danger">{formatTime(hour, minute, use24h)} is already in your schedule.</span>
        ) : days.length === 0 ? (
          <span className="text-xs text-danger">Pick at least one day.</span>
        ) : null}
      </div>
    </div>
  );
}
