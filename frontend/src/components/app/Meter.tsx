import { cn } from "@/lib/utils";

type MeterProps = {
  value: number;
  max: number;
  /** Visible label, e.g. "7 of 15 accounts". Also used as the accessible name. */
  label?: string;
  /** Right-aligned hint, e.g. "Growth". */
  hint?: string;
  /** Override tone; default turns amber at ≥ 90% and red at ≥ 100%. */
  tone?: "auto" | "default" | "warning" | "danger";
  /** "xs" is a 2px hairline with a 12px muted label (sidebar). */
  size?: "xs" | "sm" | "md";
  className?: string;
};

/** Usage bar (accounts, posts on Free, seats). */
export function Meter({
  value,
  max,
  label,
  hint,
  tone = "auto",
  size = "sm",
  className,
}: MeterProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const resolved =
    tone !== "auto"
      ? tone
      : max > 0 && value >= max
        ? "danger"
        : ratio >= 0.9
          ? "warning"
          : "default";
  return (
    <div className={cn("w-full", className)}>
      {label || hint ? (
        <div
          className={cn(
            "flex items-baseline justify-between gap-2 text-xs",
            size === "xs" ? "mb-1 text-text-muted" : "mb-1.5",
          )}
        >
          {label ? (
            <span className={cn("truncate", size === "xs" ? "text-text-muted" : "text-text")}>
              {label}
            </span>
          ) : (
            <span />
          )}
          {hint ? <span className="shrink-0 text-text-muted">{hint}</span> : null}
        </div>
      ) : null}
      <div
        role="meter"
        aria-label={label ?? "Usage"}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        className={cn(
          "w-full overflow-hidden rounded-full bg-bg-muted",
          size === "xs" ? "h-0.5" : size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
            resolved === "danger"
              ? "bg-danger"
              : resolved === "warning"
                ? "bg-warning-solid"
                : size === "xs"
                ? "bg-text-muted"
                : "bg-accent",
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
