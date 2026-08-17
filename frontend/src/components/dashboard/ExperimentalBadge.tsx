import { TestTube } from "@/icons/phosphor";
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
      title="Experimental — still being polished"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200",
        compact ? "p-0.5" : "gap-1 px-1.5 py-0.5 text-[10px]",
        className,
      )}
    >
      <TestTube size={compact ? 11 : 11} weight="fill" />
      {compact ? null : "Experimental"}
    </span>
  );
}
