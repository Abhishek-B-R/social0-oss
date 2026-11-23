import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ToggleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label. When omitted, pass `aria-label`. */
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Dims the switch while a save is in flight. */
  pending?: boolean;
  "aria-label"?: string;
  className?: string;
};

/** Switch (role="switch"). With a label it renders a full settings row. */
export function Toggle({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  pending,
  className,
  ...aria
}: ToggleProps) {
  const id = useId();
  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : aria["aria-label"]}
      aria-describedby={description ? `${id}-desc` : undefined}
      aria-busy={pending || undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "touch-hit relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-switch-off",
        pending && "opacity-70",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-4 rounded-full bg-switch-thumb shadow-sm transition-transform duration-150 motion-reduce:transition-none",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
  if (!label) return <span className={className}>{sw}</span>;
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
        {description ? (
          <p id={`${id}-desc`} className="mt-0.5 text-sm text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {sw}
    </div>
  );
}
