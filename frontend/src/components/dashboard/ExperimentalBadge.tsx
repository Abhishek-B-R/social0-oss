import { Flask } from "@/icons/phosphor";
import { cn } from "@/lib/utils";

export function ExperimentalBadge({
  className,
  compact,
  withTip = false,
}: {
  className?: string;
  compact?: boolean;
  /** Instant hover label — use next to a heading, not inside a tight nav row. */
  withTip?: boolean;
}) {
  const badge = (
    <span
      title={withTip ? undefined : "Experimental"}
      aria-label="Experimental"
      className={cn(
        "inline-flex items-center font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200",
        compact
          ? "cursor-help rounded-full p-0.5 text-amber-700 dark:text-amber-300"
          : "gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px]",
        className,
      )}
    >
      <Flask size={compact ? 12 : 11} weight="duotone" />
      {compact ? null : "Experimental"}
    </span>
  );

  if (!withTip) return badge;

  return (
    <span className="relative inline-flex group/exp">
      {badge}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-background opacity-0 shadow-sm transition-opacity group-hover/exp:opacity-100 group-focus-within/exp:opacity-100"
      >
        Experimental
      </span>
    </span>
  );
}
