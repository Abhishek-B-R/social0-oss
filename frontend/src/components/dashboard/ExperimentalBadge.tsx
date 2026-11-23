import { Flask } from "@/icons/phosphor";
import { cn } from "@/lib/utils";

export const EXPERIMENTAL_TIP =
  "Early access: you may hit bugs or small inconsistencies. We're still polishing this.";

/** Flask marker for features still in early access (Inbox, Analytics). */
export function ExperimentalBadge({
  className,
  compact,
  withTip = false,
}: {
  className?: string;
  /** Icon only, for tight rows like the sidebar. */
  compact?: boolean;
  /** Instant hover label: next to a heading, not inside a nav row. */
  withTip?: boolean;
}) {
  const badge = (
    <span
      title={withTip ? undefined : EXPERIMENTAL_TIP}
      aria-label={`Experimental. ${EXPERIMENTAL_TIP}`}
      role="img"
      tabIndex={withTip ? 0 : undefined}
      className={cn(
        "inline-flex shrink-0 cursor-help items-center font-semibold uppercase tracking-wide text-warning",
        compact
          ? "rounded-full p-0.5"
          : "gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] leading-none",
        className,
      )}
    >
      <Flask size={compact ? 12 : 11} weight="duotone" aria-hidden />
      {compact ? null : "Experimental"}
    </span>
  );

  if (!withTip) return badge;

  return (
    <span className="group/exp relative inline-flex align-middle">
      {badge}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-56 rounded-md bg-foreground px-2.5 py-1.5 text-left text-[11px] font-medium normal-case leading-snug tracking-normal text-background opacity-0 shadow-sm transition-opacity group-hover/exp:opacity-100 group-focus-within/exp:opacity-100"
      >
        {EXPERIMENTAL_TIP}
      </span>
    </span>
  );
}
