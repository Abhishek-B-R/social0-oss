import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const STEP = 15;
const SLOTS = Array.from({ length: (24 * 60) / STEP }, (_, i) => i * STEP);

function label(minutes: number, use24h: boolean): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const mm = String(m).padStart(2, "0");
  if (use24h) return `${String(h).padStart(2, "0")}:${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * "9", "930", "9:30", "9.30pm", "21:30", "9 pm" → minutes after midnight.
 * Returns null when it can't be read as a time.
 */
export function parseTypedTime(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(\d{1,2})(?:[:.]?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = m[3];
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer.startsWith("p") && h !== 12) h += 12;
    if (mer.startsWith("a") && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + min;
}

type Props = {
  id: string;
  /** Minutes after midnight in the schedule's time zone. */
  value: number;
  onChange: (minutes: number) => void;
  use24h: boolean;
  /** Slots before this (minutes after midnight) are in the past and disabled. */
  minMinutes?: number | null;
  className?: string;
};

/**
 * Time field + 15-minute list (Cal.com / Riverside style). Type any time
 * ("9:40pm") or pick from the list; the list scrolls to the current choice.
 */
export function TimeSelect({ id, value, onChange, use24h, minMinutes, className }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  // A new time from anywhere (the list, a preset, the day picker) replaces
  // whatever was typed, including an unreadable entry and its error.
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    setDraft(null);
    setInvalid(false);
  }
  const listRef = useRef<HTMLDivElement>(null);
  const shown = draft ?? label(value, use24h);

  // Keep the chosen (or nearest) slot in view.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearest = Math.round(value / STEP) * STEP;
    const el = list.querySelector<HTMLElement>(`[data-min="${nearest}"]`);
    if (el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
  }, [value]);

  const commit = () => {
    if (draft == null) return;
    const parsed = parseTypedTime(draft);
    if (parsed == null) {
      setInvalid(true);
      return;
    }
    setDraft(null);
    setInvalid(false);
    onChange(parsed);
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    next?.focus();
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <input
        id={id}
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape" && draft != null) {
            e.stopPropagation();
            setDraft(null);
            setInvalid(false);
          }
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-err` : undefined}
        autoComplete="off"
        inputMode="text"
        className={cn(
          "h-9 w-full rounded-lg border bg-bg px-3 text-sm font-medium tabular-nums text-text focus:outline-none focus:ring-2",
          invalid
            ? "border-danger focus:ring-danger/20"
            : "border-input focus:border-accent focus:ring-accent/20",
        )}
      />
      {invalid ? (
        <p id={`${id}-err`} className="text-xs text-danger">
          Try a time like 9:30 PM.
        </p>
      ) : null}
      <div
        ref={listRef}
        role="listbox"
        aria-label="Times"
        onKeyDown={onListKey}
        className="relative max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-border p-1"
      >
        {SLOTS.map((m) => {
          const selected = m === value;
          const past = minMinutes != null && m < minMinutes;
          return (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={selected}
              data-min={m}
              disabled={past}
              onClick={() => {
                setDraft(null);
                setInvalid(false);
                onChange(m);
              }}
              className={cn(
                "flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                selected
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-text hover:bg-bg-muted",
                past && "cursor-not-allowed text-text-muted/50 hover:bg-transparent",
              )}
            >
              {label(m, use24h)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
