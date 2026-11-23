import { WEBHOOK_EVENT_OPTIONS } from "./agents-api";
import { Pill, type PillTone } from "./agents-ui";

const DELIVERY_TONE: Record<string, PillTone> = {
  delivered: "ok",
  failed: "danger",
  blocked: "warning",
};

const DELIVERY_LABEL: Record<string, string> = {
  delivered: "Delivered",
  failed: "Failed",
  blocked: "Blocked",
};

/** "Delivered 200", "Failed 500", "Blocked": soft tint, no dot. */
export function DeliveryStatusPill({
  status,
  code,
}: {
  status: string;
  code: number | null;
}) {
  const label = DELIVERY_LABEL[status] ?? status;
  return (
    <Pill tone={DELIVERY_TONE[status] ?? "neutral"}>
      {label}
      {code != null ? <span className="font-mono opacity-80"> {code}</span> : null}
    </Pill>
  );
}

/** Event names as plain muted text with "+N"; the full list is in the tooltip. */
export function EventChips({ events, max = 4 }: { events: string[]; max?: number }) {
  const shown = events.slice(0, max);
  const rest = events.length - shown.length;
  return (
    <div className="text-xs leading-5 text-text-muted" title={events.join(", ")}>
      <span className="font-mono">{shown.join(", ")}</span>
      {rest > 0 ? <span> +{rest}</span> : null}
    </div>
  );
}

export function EventCheckboxes({
  value,
  onChange,
  disabled,
  lockLast = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Prevent unchecking the last event (an endpoint needs at least one). */
  lockLast?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
      {WEBHOOK_EVENT_OPTIONS.map((ev) => {
        const checked = value.includes(ev.value);
        const locked = lockLast && checked && value.length === 1;
        return (
          <label
            key={ev.value}
            className="-mx-2 flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-bg-subtle has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70"
            title={locked ? "An endpoint needs at least one event." : undefined}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-accent"
              checked={checked}
              disabled={disabled || locked}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, ev.value]
                    : value.filter((x) => x !== ev.value),
                )
              }
            />
            <span className="min-w-0">
              <span className="block font-medium text-text">{ev.label}</span>
              <span className="block font-mono text-xs text-text-muted">{ev.value}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
