import { Flask } from "@/icons/phosphor";
import { cn } from "@/lib/utils";

export const EXPERIMENTAL_TIP =
  "Early access - you may hit bugs or small inconsistencies. We're still polishing these features.";

export function ExperimentalBadge({
  className,
  compact,
  withTip = false,
}: {
  className?: string;
  compact?: boolean;
  /** Instant hover label - use next to a heading, not inside a tight nav row. */
  withTip?: boolean;
}) {
  const badge = (
    <span
      title={withTip ? undefined : EXPERIMENTAL_TIP}
      aria-label={`Experimental. ${EXPERIMENTAL_TIP}`}
      className={cn(
        "inline-flex items-center font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200",
        compact
          ? "cursor-help rounded-full p-0.5 text-amber-700 dark:text-amber-300"
          : "cursor-help gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px]",
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
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 w-56 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-1.5 text-left text-[11px] font-medium normal-case leading-snug tracking-normal text-background opacity-0 shadow-sm transition-opacity group-hover/exp:opacity-100 group-focus-within/exp:opacity-100"
      >
        {EXPERIMENTAL_TIP}
      </span>
    </span>
  );
}
