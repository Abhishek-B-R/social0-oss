import { Flask } from "@/icons/phosphor";
import { cn } from "@/lib/utils";

export function ExperimentalBadge({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      title="Experimental"
      className={cn(
        "inline-flex items-center font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200",
        compact
          ? "rounded-full p-0.5 text-amber-700 dark:text-amber-300"
          : "gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px]",
        className,
      )}
    >
      <Flask size={compact ? 12 : 11} weight="duotone" />
      {compact ? null : "Experimental"}
    </span>
  );
}
