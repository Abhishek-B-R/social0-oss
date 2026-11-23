import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { TimeSelect } from "./TimeSelect";
import "react-day-picker/style.css";
import { CalendarClock, ListOrdered, TrendingUp } from "lucide-react";
import Link from "@/components/AppLink";
import { cn } from "@/lib/utils";
import {
  formatLongTime,
  formatShortTime,
  fromWall,
  parseNaturalTime,
  safeTimezone,
  timezoneWithOffset,
  wallParts,
} from "./nl-time";
import type { NextSlot } from "./use-composer-data";
import type { BestTime } from "./best-time";

type Props = {
  /** Currently picked time (ISO) or null. */
  value: string | null;
  /** Queue slot `value` came from, if any: kept when the pick is unchanged. */
  valueSlotId?: string | null;
  timezone: string;
  /** The account's default zone (for "change" + reset). */
  defaultTimezone: string;
  onTimezoneChange: (tz: string | null) => void;
  use24h: boolean;
  dateFormat: string;
  nextSlot: NextSlot | null;
  /** From the person's published posts; null hides the preset. */
  bestTime?: BestTime | null;
  /** Commit a time and submit. `slotId` when it came from the queue. */
  onSchedule: (at: Date, slotId: string | null) => void;
  /** Remember a picked time without submitting (primary button shows it). */
  onPick: (at: Date, slotId: string | null) => void;
  onPublishNow: () => void;
  onSaveDraft: () => void;
  /** Whether "Publish now" is allowed (and why not). */
  canPublish: boolean;
  publishDisabledReason: string | null;
  /** Whether scheduling is allowed (and why not). Can differ from publish now:
   *  rescheduling an already-scheduled post costs no free post. */
  canSchedule: boolean;
  scheduleDisabledReason: string | null;
  scheduleQueueHref: string;
  settingsHref: string;
  /** "Save" wording when editing a scheduled post. */
  submitLabel?: string;
};

function tomorrowAt(tz: string, h: number): Date {
  const p = wallParts(new Date(), tz);
  return fromWall(tz, p.year, p.month, p.day + 1, h, 0);
}

function nextMondayAt(tz: string, h: number): Date {
  const p = wallParts(new Date(), tz);
  const dow = new Date(p.year, p.month, p.day).getDay();
  const diff = (1 - dow + 7) % 7 || 7;
  return fromWall(tz, p.year, p.month, p.day + diff, h, 0);
}


/**
 * Schedule popover body: type a time ("tomorrow 9am"), pick a preset or a
 * date, see the timezone, and get told when the time is in the past.
 */
export function SchedulePanel({
  value,
  valueSlotId = null,
  timezone,
  defaultTimezone,
  onTimezoneChange,
  use24h,
  dateFormat,
  nextSlot,
  bestTime = null,
  onSchedule,
  onPick,
  onPublishNow,
  onSaveDraft,
  canPublish,
  publishDisabledReason,
  canSchedule,
  scheduleDisabledReason,
  scheduleQueueHref,
  settingsHref,
  submitLabel = "Schedule",
}: Props) {
  const tz = safeTimezone(timezone);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<{ at: Date; slotId: string | null }>(() => {
    // An already queued time keeps its slot until another time is picked.
    if (value) return { at: new Date(value), slotId: valueSlotId };
    if (nextSlot) return { at: new Date(nextSlot.scheduledAt), slotId: nextSlot.slotId };
    return { at: tomorrowAt(tz, 9), slotId: null };
  });
  const [showZones, setShowZones] = useState(false);
  const pick = (at: Date, slotId: string | null) => setPicked({ at, slotId });

  // Every new pick (typed, preset, day, time, or a typed time re-read in a
  // new zone) goes to the composer, so its button shows it. The suggestion
  // the panel opens with doesn't: opening it picks nothing.
  const sentPick = useRef(picked);
  const notifyPick = useEffectEvent((p: { at: Date; slotId: string | null }) => {
    if (p.at.getTime() > Date.now()) onPick(p.at, p.slotId);
  });
  useEffect(() => {
    if (sentPick.current === picked) return;
    sentPick.current = picked;
    notifyPick(picked);
  }, [picked]);

  const parsed = useMemo(
    () => (text.trim() ? parseNaturalTime(text, { timezone: tz, dateFormat }) : null),
    [text, tz, dateFormat],
  );
  // Typed text is read in the post's zone. When the zone changes (the zone
  // picker, or settings arriving after the panel opened on the UTC fallback),
  // re-read it so the Schedule button, the preview and Enter all mean the
  // same instant. Presets / day / time clear the text, so they're kept.
  const [readIn, setReadIn] = useState({ tz, dateFormat });
  if (readIn.tz !== tz || readIn.dateFormat !== dateFormat) {
    setReadIn({ tz, dateFormat });
    if (parsed && parsed.getTime() !== picked.at.getTime()) setPicked({ at: parsed, slotId: null });
  }
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const past = picked.at.getTime() <= now;
  const wall = wallParts(picked.at, tz);
  const zones = useMemo<string[]>(() => {
    if (!showZones) return [];
    try {
      const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      return fn ? fn("timeZone") : [tz];
    } catch {
      return [tz];
    }
  }, [showZones, tz]);

  const presets: Array<{
    key: string;
    label: string;
    at: Date;
    slotId: string | null;
    title?: string;
  }> = [];
  if (nextSlot) {
    presets.push({
      key: "slot",
      label: `Next free slot · ${formatShortTime(new Date(nextSlot.scheduledAt), tz, use24h)}`,
      at: new Date(nextSlot.scheduledAt),
      slotId: nextSlot.slotId,
    });
  }
  if (bestTime && bestTime.at.getTime() > now) {
    presets.push({
      key: "best",
      label: `Best time · ${formatShortTime(bestTime.at, tz, use24h)}`,
      at: bestTime.at,
      slotId: null,
      title: `Your posts at this day and hour got the most engagement, based on ${bestTime.sample} published posts in the last 3 months.`,
    });
  }
  presets.push(
    { key: "1h", label: "In 1 hour", at: new Date(now + 60 * 60_000), slotId: null },
    { key: "tom9", label: `Tomorrow ${use24h ? "09:00" : "9:00 AM"}`, at: tomorrowAt(tz, 9), slotId: null },
    { key: "mon9", label: `Next Monday ${use24h ? "09:00" : "9:00 AM"}`, at: nextMondayAt(tz, 9), slotId: null },
  );

  const commit = () => {
    if (past) return;
    onSchedule(picked.at, picked.slotId);
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="composer-when" className="sr-only">
          When
        </label>
        <input
          id="composer-when"
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const at = next.trim() ? parseNaturalTime(next, { timezone: tz, dateFormat }) : null;
            if (at) pick(at, null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              // Keep ⌘↵ from also reaching the composer's submit shortcut.
              e.stopPropagation();
              if (parsed && parsed.getTime() > Date.now()) onSchedule(parsed, null);
            }
          }}
          placeholder="Type a time: tomorrow 9am, fri 6pm, in 2 hours"
          autoComplete="off"
          className="h-10 w-full rounded-lg border border-input bg-bg px-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <p className="mt-1 min-h-4 text-xs text-text-muted" aria-live="polite">
          {text.trim()
            ? parsed
              ? `→ ${formatLongTime(parsed, tz, use24h)}`
              : "Can't read that yet. Try “tomorrow 9am” or “fri 6pm”."
            : null}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick picks">
        {presets.map((p) => {
          const on = Math.abs(p.at.getTime() - picked.at.getTime()) < 60_000 && p.slotId === picked.slotId;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setText("");
                pick(p.at, p.slotId);
              }}
              aria-pressed={on}
              title={p.title}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                on ? "bg-accent/10 text-text" : "bg-bg-muted text-text-muted hover:text-text",
              )}
            >
              {p.key === "slot" ? <ListOrdered className="size-3" aria-hidden /> : null}
              {p.key === "best" ? <TrendingUp className="size-3" aria-hidden /> : null}
              {p.label}
            </button>
          );
        })}
        {!nextSlot ? (
          <Link
            href={scheduleQueueHref}
            className="inline-flex h-7 items-center px-1 text-xs font-medium text-accent hover:text-accent-hover"
          >
            Set up a posting schedule
          </Link>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <DayPicker
          mode="single"
          selected={new Date(wall.year, wall.month, wall.day)}
          defaultMonth={new Date(wall.year, wall.month, 1)}
          onSelect={(d) => {
            if (!d) return;
            setText("");
            pick(
              fromWall(tz, d.getFullYear(), d.getMonth(), d.getDate(), wall.hour, wall.minute),
              null,
            );
          }}
          disabled={(d) => {
            const t = wallParts(new Date(), tz);
            return d < new Date(t.year, t.month, t.day);
          }}
          weekStartsOn={1}
          className="text-xs"
          classNames={{
            month_caption: "flex h-8 items-center text-xs font-semibold text-text",
            nav: "absolute right-0 top-0 flex items-center gap-0.5",
            button_previous: "inline-flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-30",
            button_next: "inline-flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-30",
            chevron: "size-3.5 fill-current",
            weekday: "w-8 text-center text-[11px] font-medium text-text-muted",
            day: "size-8 p-0 text-center text-xs",
            day_button: "size-8 rounded-md text-text hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            selected: "[&>button]:!bg-accent [&>button]:!text-accent-foreground",
            today: "font-semibold text-accent",
            outside: "opacity-40",
            disabled: "opacity-35 [&>button]:cursor-not-allowed",
          }}
          style={{ ["--rdp-accent-color" as string]: "var(--accent)" }}
        />
        <div className="flex-1 space-y-2">
          <label className="block text-xs font-medium text-text-muted" htmlFor="composer-time">
            Time
          </label>
          <TimeSelect
            id="composer-time"
            value={wall.hour * 60 + wall.minute}
            use24h={use24h}
            minMinutes={(() => {
              const t = wallParts(new Date(), tz);
              return t.year === wall.year && t.month === wall.month && t.day === wall.day
                ? t.hour * 60 + t.minute
                : null;
            })()}
            onChange={(mins) => {
              setText("");
              pick(
                fromWall(tz, wall.year, wall.month, wall.day, Math.floor(mins / 60), mins % 60),
                null,
              );
            }}
          />
          <p className="flex items-start gap-1.5 text-xs text-text">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden />
            {formatLongTime(picked.at, tz, use24h)}
          </p>
          {past ? (
            <p className="text-xs text-danger" role="alert">
              That time has passed. Pick a later one.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-text-muted">
        <p>
          {timezoneWithOffset(tz)}
          {" · "}
          <button
            type="button"
            onClick={() => setShowZones((s) => !s)}
            className="font-medium text-accent hover:text-accent-hover"
            aria-expanded={showZones}
          >
            change
          </button>
        </p>
        {showZones ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="composer-tz" className="sr-only">
              Timezone for this post
            </label>
            <select
              id="composer-tz"
              value={tz}
              onChange={(e) => onTimezoneChange(e.target.value === defaultTimezone ? null : e.target.value)}
              className="h-8 max-w-[14rem] rounded-md border border-input bg-bg px-2 text-xs text-text"
            >
              {zones.includes(tz) ? null : <option value={tz}>{tz}</option>}
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <Link href={settingsHref} className="font-medium text-accent hover:text-accent-hover">
              Change your default
            </Link>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={onPublishNow}
            disabled={!canPublish}
            title={publishDisabledReason ?? undefined}
            className="font-medium text-text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            Publish now
          </button>
          <button type="button" onClick={onSaveDraft} className="font-medium text-text-muted hover:text-text">
            Save as draft
          </button>
        </div>
        <button
          type="button"
          onClick={commit}
          disabled={past || !canSchedule}
          title={past ? "Pick a time in the future" : (scheduleDisabledReason ?? undefined)}
          className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel} · {formatShortTime(picked.at, tz, use24h)}
        </button>
      </div>
    </div>
  );
}
