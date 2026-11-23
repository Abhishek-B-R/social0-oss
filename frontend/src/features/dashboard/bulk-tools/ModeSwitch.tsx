import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { ImportMode } from "./bulk-import-model";

const OPTIONS: { value: ImportMode; label: string }[] = [
  { value: "schedule", label: "Schedule" },
  { value: "queue", label: "Add to queue" },
  { value: "draft", label: "Drafts" },
];

/** "Import as: Schedule · Add to queue · Drafts" (radio group, arrow keys move). */
export function ModeSwitch({
  value,
  onChange,
  disabled,
  className,
}: {
  value: ImportMode;
  onChange: (mode: ImportMode) => void;
  disabled?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, index: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Import as"
      className={cn("inline-flex rounded-xl border border-border bg-bg-subtle p-0.5", className)}
    >
      {OPTIONS.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "h-8 rounded-[10px] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 touch:h-10",
              selected
                ? "bg-bg-elevated text-text shadow-sm"
                : "text-text-muted hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
