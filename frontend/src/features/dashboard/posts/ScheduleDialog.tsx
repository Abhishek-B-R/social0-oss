import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { CalendarClock, ListOrdered } from "lucide-react";
import Link from "@/components/AppLink";
import { useDashboardPath } from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTimezoneLabel } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { fetchNextSlot, type ScheduleTarget } from "./post-actions";
import { userTimezone } from "./posts-model";

type ScheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  /** Number of posts, for "each post takes the next free slot". */
  count: number;
  timezone: string | null;
  /** Prefill for "Pick a time" (e.g. the post's current time). */
  initialAt?: Date | null;
  /** Which option starts selected (Reschedule starts on "Pick a time"). */
  defaultMode?: "queue" | "time";
  onConfirm: (target: ScheduleTarget) => Promise<void>;
};

function defaultParts(tz: string, initial?: Date | null): { date: string; time: string } {
  const base =
    initial && initial.getTime() > Date.now()
      ? initial
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    date: formatInTimeZone(base, tz, "yyyy-MM-dd"),
    time: initial && initial.getTime() > Date.now() ? formatInTimeZone(base, tz, "HH:mm") : "09:00",
  };
}

/**
 * "When should these go out?" Two choices: the next free slots in the
 * posting schedule, or one exact time in the user's timezone (past times
 * are rejected before anything is sent).
 */
export function ScheduleDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  count,
  timezone,
  initialAt,
  defaultMode = "queue",
  onConfirm,
}: ScheduleDialogProps) {
  const dash = useDashboardPath();
  const tz = userTimezone(timezone);
  const formId = useId();
  const [modeChoice, setMode] = useState<"queue" | "time">(defaultMode);
  const [{ date, time }, setParts] = useState(() => defaultParts(tz, initialAt));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const slotQuery = useQuery({
    queryKey: ["queue-next-slot"],
    queryFn: fetchNextSlot,
    enabled: open,
    staleTime: 15_000,
  });
  const slot = slotQuery.data ?? null;
  const noSchedule = slotQuery.isSuccess && !slot;

  // Reset each time the dialog opens.
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setParts(defaultParts(tz, initialAt));
      setMode(defaultMode);
      setError(null);
      setPending(false);
    }
  }

  // No schedule set up → picking a time is the only choice.
  const mode = noSchedule ? "time" : modeChoice;

  const submit = async () => {
    setError(null);
    let target: ScheduleTarget;
    if (mode === "queue") {
      if (slotQuery.isError) {
        setError("Couldn't load your posting schedule. Retry, or pick a time.");
        return;
      }
      if (!slot) {
        setError("There's no free slot in your posting schedule. Pick a time instead.");
        return;
      }
      target = { kind: "queue" };
    } else {
      if (!date || !time) {
        setError("Pick a date and a time.");
        return;
      }
      const at = fromZonedTime(`${date}T${time}:00`, tz);
      if (Number.isNaN(at.getTime())) {
        setError("That date isn't valid.");
        return;
      }
      if (at.getTime() < Date.now() + 60_000) {
        setError("That time has already passed. Pick a time in the future.");
        return;
      }
      target = { kind: "time", at };
    }
    setPending(true);
    try {
      await onConfirm(target);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  const optionCls = (on: boolean, disabled?: boolean) =>
    cn(
      "flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
      on ? "border-text bg-bg-subtle" : "border-border hover:border-text-subtle",
      disabled && "cursor-not-allowed opacity-60 hover:border-border",
    );

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-2"
        >
          <fieldset className="space-y-2">
            <legend className="sr-only">When to publish</legend>
            <label className={optionCls(mode === "queue", noSchedule)}>
              <input
                type="radio"
                name={`${formId}-mode`}
                className="sr-only"
                checked={mode === "queue"}
                disabled={noSchedule}
                onChange={() => setMode("queue")}
              />
              <ListOrdered className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text">Add to queue</span>
                <span className="block text-xs text-text-muted">
                  {slotQuery.isLoading
                    ? "Finding the next free slot…"
                    : slotQuery.isError
                      ? (
                          <>
                            Couldn't load your posting schedule.{" "}
                            <button
                              type="button"
                              onClick={() => {
                                setError(null);
                                void slotQuery.refetch();
                              }}
                              disabled={slotQuery.isFetching}
                              className="font-medium text-text underline underline-offset-2 disabled:no-underline disabled:opacity-60"
                            >
                              {slotQuery.isFetching ? "Retrying…" : "Retry"}
                            </button>
                          </>
                        )
                      : slot
                        ? count > 1
                          ? `Each post takes the next free slot, starting ${slot.displayLabel}.`
                          : `Next free slot: ${slot.displayLabel}.`
                        : (
                            <>
                              No posting schedule yet.{" "}
                              <Link
                                href={dash("settings/schedule")}
                                className="font-medium text-text underline underline-offset-2"
                              >
                                Set one up
                              </Link>
                            </>
                          )}
                </span>
              </span>
            </label>

            <label className={optionCls(mode === "time")}>
              <input
                type="radio"
                name={`${formId}-mode`}
                className="sr-only"
                checked={mode === "time"}
                onChange={() => setMode("time")}
              />
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text">Pick a time</span>
                <span className="block text-xs text-text-muted">
                  {count > 1 ? "All selected posts go out at this time." : "Publish at an exact time."}{" "}
                  Times are in {formatTimezoneLabel(tz)}.
                </span>
              </span>
            </label>

            {mode === "time" ? (
              <div className="grid grid-cols-[1fr_auto] gap-2 pl-1 pt-1">
                <label className="block">
                  <span className="sr-only">Date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setParts((p) => ({ ...p, date: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-border bg-bg-elevated px-3 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </label>
                <label className="block">
                  <span className="sr-only">Time</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setParts((p) => ({ ...p, time: e.target.value }))}
                    className="h-10 rounded-lg border border-border bg-bg-elevated px-3 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </label>
              </div>
            ) : null}
          </fieldset>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={pending || (mode === "queue" && (slotQuery.isLoading || (slotQuery.isError && slotQuery.isFetching)))}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
