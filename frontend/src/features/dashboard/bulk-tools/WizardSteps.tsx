import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStep } from "./use-bulk-import";

const STEPS: { step: WizardStep; label: string }[] = [
  { step: 1, label: "Upload" },
  { step: 2, label: "Match" },
  { step: 3, label: "Review" },
];

/** "1 Upload — 2 Match — 3 Review". Done steps are clickable. */
export function WizardSteps({
  current,
  maxReachable,
  onGo,
}: {
  current: WizardStep;
  /** Furthest step the user may jump to right now. */
  maxReachable: WizardStep;
  onGo: (step: WizardStep) => void;
}) {
  return (
    <nav aria-label="Import steps">
      <ol className="-ml-1.5 flex items-center gap-2 text-sm">
        {STEPS.map(({ step, label }, i) => {
          const done = step < current;
          const active = step === current;
          const reachable = step <= maxReachable && !active;
          return (
            <li key={step} className="flex min-w-0 items-center gap-2">
              {i > 0 ? (
                <span aria-hidden className="h-px w-4 shrink-0 bg-border sm:w-8" />
              ) : null}
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onGo(step)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "inline-flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  reachable && "hover:bg-bg-muted",
                  !reachable && !active && "cursor-default",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex w-3.5 shrink-0 justify-center tabular-nums",
                    active ? "font-semibold text-accent" : "text-text-muted",
                  )}
                >
                  {done ? <Check className="size-3.5 text-accent" /> : step}
                </span>
                <span
                  className={cn(
                    "truncate",
                    active ? "font-medium text-text" : "text-text-muted",
                  )}
                >
                  {label}
                  <span className="sr-only">
                    {active ? " (current step)" : done ? " (done)" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
