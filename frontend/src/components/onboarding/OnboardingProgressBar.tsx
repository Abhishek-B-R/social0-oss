import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ONBOARDING_STEPS } from "@/features/onboarding/lib/paths";

type OnboardingProgressBarProps = {
  /** 1–3. */
  currentStep: number;
};

/** Three-step progress: Goal · Connect · How you'll post. */
export function OnboardingProgressBar({
  currentStep,
}: OnboardingProgressBarProps) {
  const total = ONBOARDING_STEPS.length;
  const clamped = Math.min(total, Math.max(1, currentStep));

  return (
    <nav className="w-full max-w-md" aria-label="Setup progress">
      <ol className="flex items-center gap-2">
        {ONBOARDING_STEPS.map((step, i) => {
          const isCurrent = step.num === clamped;
          const isPast = step.num < clamped;
          return (
            <li
              key={step.num}
              className="flex min-w-0 flex-1 items-center gap-2"
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors motion-reduce:transition-none",
                  isPast && "bg-accent text-accent-foreground",
                  isCurrent && "bg-foreground text-background",
                  !isPast &&
                    !isCurrent &&
                    "border border-border bg-background text-muted-foreground",
                )}
              >
                {isPast ? (
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                ) : (
                  step.num
                )}
              </span>
              <span
                className={cn(
                  "hidden truncate text-[12px] font-medium sm:block",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
                <span className="sr-only">
                  {isPast ? " (done)" : isCurrent ? " (current step)" : ""}
                </span>
              </span>
              {i < total - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-px min-w-3 flex-1",
                    isPast ? "bg-accent" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        Step {clamped} of {total}
      </p>
    </nav>
  );
}
